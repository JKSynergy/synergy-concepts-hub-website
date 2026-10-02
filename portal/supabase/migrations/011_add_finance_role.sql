-- 011: add the FINANCE role.
-- Kept in its own migration: a newly added enum value cannot be used in the same
-- transaction that adds it, so every policy/function that references 'finance'
-- lives in 012.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';
