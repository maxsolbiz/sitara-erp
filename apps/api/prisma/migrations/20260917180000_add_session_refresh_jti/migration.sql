-- AlterTable
-- Phase 1 refresh-token reuse detection: stores the jti of the currently
-- valid refresh token per session. Nullable so pre-existing rows stay
-- valid (they stamp on next rotation). No backfill, no default, no index.
ALTER TABLE "user_sessions" ADD COLUMN "refresh_token_jti" VARCHAR(255);
