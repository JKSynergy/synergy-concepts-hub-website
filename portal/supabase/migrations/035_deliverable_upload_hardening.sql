-- ============================================================================
-- Migration 035: Deliverable upload hardening
-- ============================================================================
-- Review-only until explicitly applied. The application enforces the same
-- 50 MiB ceiling and canonical MIME policy before issuing a signed upload URL.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.deliverables
    WHERE file_url IS NOT NULL
    GROUP BY file_url
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique deliverable paths: duplicate file_url values exist';
  END IF;
END;
$$;

DO $$
DECLARE
  v_index regclass := to_regclass('public.uq_deliverables_file_url');
BEGIN
  IF v_index IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attname = 'file_url'
    WHERE i.indexrelid = v_index
      AND i.indrelid = 'public.deliverables'::regclass
      AND i.indisunique
      AND i.indnkeyatts = 1
      AND i.indnatts = 1
      AND i.indkey::text = a.attnum::text
      AND pg_get_expr(i.indpred, i.indrelid) = '(file_url IS NOT NULL)'
  ) THEN
    RAISE EXCEPTION 'Index public.uq_deliverables_file_url exists with an unexpected definition';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_deliverables_file_url
  ON public.deliverables (file_url)
  WHERE file_url IS NOT NULL;

DO $$
DECLARE
  v_allowed text[] := ARRAY[
    'application/msword',
    'application/octet-stream',
    'application/pdf',
    'application/postscript',
    'application/rtf',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'application/zip',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'image/vnd.adobe.photoshop',
    'image/webp',
    'text/csv',
    'text/plain',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]::text[];
BEGIN
  UPDATE storage.buckets
  SET file_size_limit = 52428800,
      allowed_mime_types = v_allowed
  WHERE id = 'deliverables' AND public = false;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'deliverables'
      AND public = false
      AND file_size_limit = 52428800
      AND allowed_mime_types @> v_allowed
      AND v_allowed @> allowed_mime_types
  ) THEN
    RAISE EXCEPTION 'Private deliverables bucket not found or exact limits were not applied';
  END IF;
END;
$$;

COMMIT;
