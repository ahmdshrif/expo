import Foundation
import ExpoModulesCore
import EXUpdatesInterface

internal let logger = Logger(logHandlers: [createOSLogHandler(category: Logger.EXPO_LOG_CATEGORY)])

// `@unchecked Sendable` because Swift 6 makes `AsyncFunction` closures `@Sendable`, so they can't
// capture the non-Sendable module otherwise. The cached session handles below are the only shared
// mutable state reachable from an async function, and `sessionLock` serializes every access to them,
// so the unchecked conformance is sound.
public final class AppMetricsModule: Module, UpdatesStateChangeListener, @unchecked Sendable {
  var subscription: UpdatesStateChangeSubscription?

  // Cached JS handles for the live sessions. Returning the same `SessionRef` instance from every
  // call makes the shared-object registry hand JavaScript the identical object each time, so
  // `getMainSession() === getMainSession()` holds while the handle stays referenced. The foreground
  // handle is rebuilt only when the underlying session rotates.
  //
  // `getForegroundSession` is async and can be re-entered across its `await`, so writes to these
  // handles must be serialized. `sessionLock` guards both; it is taken only around the cache
  // read/write, never held across a suspension point.
  private let sessionLock = NSLock()
  private var mainSessionRef: SessionRef?
  private var foregroundSessionRef: SessionRef?

  public func definition() -> ModuleDefinition {
    Name("ExpoAppMetrics")

    OnCreate {
      AppMetricsActor.isolated {
        AppMetrics.mainSession.updatesMonitor.patchAppInfoIfNeeded()
      }
      if let updatesController = UpdatesControllerRegistry.sharedInstance.controller {
        subscription = updatesController.subscribeToUpdatesStateChanges(self)
      }
    }

    OnDestroy {
      subscription?.remove()
    }

    Function("markFirstRender") {
      AppMetrics.mainSession.appStartupMonitor.markFirstRender()
    }

    Function("markInteractive") { (attributes: MetricAttributes?) in
      AppMetrics.mainSession.appStartupMonitor.markInteractive(
        routeName: attributes?.routeName,
        params: attributes?.params ?? [:]
      )
    }

    Function("logEvent") { (name: String, options: LogEventOptions?) in
      guard let validatedName = validateEventName(name) else {
        return
      }
      let validatedBody = validateEventBody(options?.body)
      let sanitized = sanitizeLogEventAttributes(options?.attributes)
      // Globals merge happens in `LogRow.from` so every persistence path picks them up.
      let record = LogRecord(
        name: validatedName,
        body: validatedBody,
        attributes: sanitized.attributes,
        droppedAttributesCount: sanitized.droppedCount,
        severity: options?.severity ?? .info
      )

      AppMetricsActor.isolated {
        AppMetrics.mainSession.receiveLog(record)
      }
    }

    Function("setGlobalAttributes") { (attributes: [String: Any]?) in
      GlobalAttributes.set(attributes)
    }

    AsyncFunction("getAppStartupTimesAsync") {
      return await AppMetrics.mainSession.appStartupMonitor.metrics
    }

    AsyncFunction("getMemoryUsageSnapshotAsync") {
      return try await AppMetricsActor.isolated {
        return MemoryUsageSnapshot.getCurrent()
      }
    }

    AsyncFunction("getFrameRateMetricsAsync") {
      return await AppMetrics.mainSession.frameMetricsRecorder.metrics
    }

    AsyncFunction("clearStoredEntries") {
      // no-op
    }

    // Debug-only: the inactive (ended) sessions as plain eager `DebugSession` records (decoded
    // `StoredSession`s), newest first. The live session is excluded; reach it via `getMainSession()`.
    AsyncFunction("getInactiveSessions") { () -> [StoredSession] in
      return try await AppMetricsActor.isolated {
        return try AppMetrics.database?
          .getInactiveSessionsWithChildren()
          .map { StoredSession(from: $0) } ?? []
      }.value
    }

    AsyncFunction("addCustomMetricToSession") { (jsMetric: JsMetric) in
      try await AppMetricsActor.isolated {
        let metric = jsMetric.toMetric()
        try AppMetrics.database?.insert(metric: MetricRow.from(metric: metric, sessionId: jsMetric.sessionId))
      }.value
    }

    // Synchronous and never nil: the main session is the process-lifetime singleton, always
    // available. We wrap the live instance (no storage round-trip) and cache the handle so repeated
    // calls return the same shared object.
    Function("getMainSession") { () -> SessionRef in
      return self.sessionLock.withLock {
        if let mainSessionRef = self.mainSessionRef {
          return mainSessionRef
        }
        let ref = SessionRef(AppMetrics.mainSession)
        self.mainSessionRef = ref
        return ref
      }
    }

    // Returns the current foreground session, or `nil` when the app is not in the foreground.
    // Reads the actor-isolated `foregroundSession`, so it's async. The handle is cached and reused
    // while the same foreground session is current, and rebuilt when the session rotates, so the
    // reference is static per foreground session.
    AsyncFunction("getForegroundSession") { () -> SessionRef? in
      let session = try await AppMetricsActor.isolated { AppMetrics.foregroundSession }.value
      return self.sessionLock.withLock { () -> SessionRef? in
        guard let session else {
          self.foregroundSessionRef = nil
          return nil
        }
        if let cached = self.foregroundSessionRef, cached.ref === session {
          return cached
        }
        let ref = SessionRef(session)
        self.foregroundSessionRef = ref
        return ref
      }
    }

    Class("Session", SessionRef.self) {
      Property("id") { $0.ref.id }
      Property("type") { $0.ref.type.rawValue }
      Property("startDate") { $0.ref.startDate.ISO8601Format() }

      // `isActive`/`getEndDate` read the live wrapped instance on `AppMetricsActor` — where
      // `Session.stop()` mutates `endDate` — so the read is serialized against the write rather than
      // racing it off-actor.
      AsyncFunction("isActive") { (session: SessionRef) -> Bool in
        let liveSession = session.ref
        return try await AppMetricsActor.isolated { liveSession.isActive }.value
      }

      AsyncFunction("getEndDate") { (session: SessionRef) -> String? in
        let liveSession = session.ref
        return try await AppMetricsActor.isolated { liveSession.endDate?.ISO8601Format() }.value
      }

      AsyncFunction("getMetrics") { (session: SessionRef) -> [Metric] in
        let sessionId = session.ref.id
        return try await AppMetricsActor.isolated {
          let rows = try AppMetrics.database?.getMetrics(sessionId: sessionId) ?? []
          return decodeMetrics(from: rows)
        }.value
      }

      AsyncFunction("getLogs") { (session: SessionRef) -> [LogRecord] in
        let sessionId = session.ref.id
        return try await AppMetricsActor.isolated {
          let rows = try AppMetrics.database?.getLogs(sessionId: sessionId) ?? []
          return decodeLogs(from: rows)
        }.value
      }

      AsyncFunction("addMetric") { (session: SessionRef, input: SessionMetricInput) in
        let sessionId = session.ref.id
        try await AppMetricsActor.isolated {
          let metric = input.toMetric(sessionId: sessionId)
          try AppMetrics.database?.insert(metric: MetricRow.from(metric: metric, sessionId: sessionId))
        }.value
      }
    }

    // Returns the current foreground session, or `nil` when the app is not in the foreground.
    // Reads the actor-isolated `foregroundSession`, so it's async. The handle is cached and reused
    // while the same foreground session is current, and rebuilt when the session rotates, so the
    // reference is static per foreground session.
    AsyncFunction("getForegroundSession") { () -> StoredSession? in
      return try await AppMetricsActor.isolated {
        let foregroundSessionId = AppMetrics.foregroundSession.id
        guard let row = try AppMetrics.database?
          .getAllSessionsWithChildren()
          .first(where: { $0.session.id == foregroundSessionId }) else {
          return nil
        }
        return StoredSession(from: row)
      }.value
    }

    Function("simulateCrashReport") {
      simulateCrashReport()
    }

    Function("triggerCrash") { (kind: CrashKind) in
      switch kind {
      case .badAccess: CrashTriggers.badAccess()
      case .fatalError: CrashTriggers.fatalErrorCrash()
      case .divideByZero: CrashTriggers.divideByZero()
      case .forceUnwrapNil: CrashTriggers.forceUnwrapNil()
      case .arrayOutOfBounds: CrashTriggers.arrayOutOfBounds()
      case .objcException: CrashTriggers.objcException()
      case .stackOverflow: CrashTriggers.stackOverflow()
      }
    }
  }

  public func updatesStateDidChange(_ event: [String : Any]) {
    if UpdatesStateEvent.fromDict(event)?.type ?? .restart == .downloadCompleteWithUpdate,
      let metric = AppMetrics.mainSession.updatesMonitor.downloadTimeMetric(subscription) {
      Task { @AppMetricsActor in
        AppMetrics.mainSession.updatesMonitor.reportMetric(metric)
      }
    }
  }
}

struct MetricAttributes: Record {
  @Field var routeName: String?
  @Field var params: [String: Any]?
}

enum CrashKind: String, Enumerable {
  /// EXC_BAD_ACCESS / SIGSEGV — dereference of a bogus pointer.
  case badAccess
  /// EXC_CRASH / SIGABRT — Swift `fatalError`.
  case fatalError
  /// EXC_ARITHMETIC / SIGFPE — integer divide by zero.
  case divideByZero
  /// EXC_BAD_INSTRUCTION — force-unwrap of a nil optional.
  case forceUnwrapNil
  /// EXC_BAD_INSTRUCTION — out-of-bounds Swift array access.
  case arrayOutOfBounds
  /// Uncaught Objective-C `NSException`, populates MetricKit's `exceptionReason`.
  case objcException
  /// Stack overflow via unbounded recursion.
  case stackOverflow
}
