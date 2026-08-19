-- Implementation tracker status is separate from the public project status.
-- Rows already marked through the tracker are moved back to the regular map's
-- default project status while their project_implementations records remain.
UPDATE public.projects AS p
SET status = 'ongoing',
    updated_at = now()
FROM public.project_implementations AS pi
WHERE pi.project_id = p.id
  AND pi.status = 'implemented'
  AND p.status = 'implemented';
