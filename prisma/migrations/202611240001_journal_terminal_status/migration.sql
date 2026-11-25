-- Preserve rejected/cancelled drafts and their audit trail instead of deleting them.
ALTER TYPE "EntryStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "EntryStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
