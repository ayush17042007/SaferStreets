-- Migration 3: generic audit action for moderator status changes.
ALTER TYPE "ModerationActionType" ADD VALUE IF NOT EXISTS 'STATUS_CHANGE';
