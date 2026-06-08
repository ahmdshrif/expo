// Copyright 2025-present 650 Industries. All rights reserved.

import ExpoModulesCore

/**
 JS-facing handle to a live session, exposed as the `Session` class. Carries the native `Session`
 instance itself (the singleton `MainSession`, or the current `ForegroundSession`), so a JS
 reference keeps the native instance alive — no id registry needed.

 Mutable state (`isActive`, `endDate`) is read live from the wrapped instance; metrics and logs are
 read from the database by the `Class("Session", …)` async methods. 
 */
final class SessionRef: SharedRef<Session> {
  override var nativeRefType: String {
    "session"
  }
}
