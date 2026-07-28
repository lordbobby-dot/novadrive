/** Ephemeral cross-tab upload-sync events, pushed straight to the owner's socket room via
 * RealtimeEmitter — deliberately bypassing ActivityEvent/Notification, since per-part progress
 * fires far too often to persist and isn't something any user needs to see again after their
 * tabs are closed. A tab other than the one that initiated the upload uses these to mirror
 * progress in its own upload-progress panel. */
export const UPLOAD_STARTED = 'upload:started';
export const UPLOAD_PROGRESS = 'upload:progress';
export const UPLOAD_COMPLETED = 'upload:completed';
export const UPLOAD_FAILED = 'upload:failed';
export const UPLOAD_ABORTED = 'upload:aborted';
export const UPLOAD_QUARANTINED = 'upload:quarantined';
