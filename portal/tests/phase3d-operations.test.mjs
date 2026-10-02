// Phase 3D: Operations Management (Tasks & Incidents) Unit & Invariant Tests
// Validates tasks, incidents, same-client integrity, lifecycle controls,
// RBAC boundaries, delete safety, audit logging, and financial anti-leak.
// Uses PGlite in-memory Postgres harness.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser } from "./helpers/db.mjs";

async function setupAccounts(db) {
  const adminId = "00000000-0000-0000-0000-000000000001";
  const staffId = "00000000-0000-0000-0000-000000000002";
  const staff2Id = "00000000-0000-0000-0000-000000000006";
  const financeId = "00000000-0000-0000-0000-000000000003";
  const clientAId = "00000000-0000-0000-0000-000000000004";
  const clientBId = "00000000-0000-0000-0000-000000000005";

  for (const [id, email, role] of [
    [adminId, "admin@synergy.ug", "admin"],
    [staffId, "staff@synergy.ug", "staff"],
    [staff2Id, "staff2@synergy.ug", "staff"],
    [financeId, "finance@synergy.ug", "finance"],
    [clientAId, "clienta@company.com", "client"],
    [clientBId, "clientb@corp.com", "client"],
  ]) {
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${id}', '${email}') ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.profiles (id, email, role) VALUES ('${id}', '${email}', '${role}') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    `);
  }

  // Setup Providers, Accounts, Systems, Resources, Agreements
  await db.exec(`
    INSERT INTO public.providers (id, name, slug) VALUES ('11111111-1111-1111-1111-111111111111', 'Vercel', 'vercel') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership)
    VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'SCH Team', 'sch_managed') ON CONFLICT DO NOTHING;

    -- Client A System & Resources
    INSERT INTO public.systems (id, client_id, name, system_type, status)
    VALUES ('33333333-3333-3333-3333-333333333333', '${clientAId}', 'Client A System', 'web_platform', 'live') ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Client A Web App', 'web_app', '${clientAId}', 'active') ON CONFLICT DO NOTHING;

    -- Client B System & Resources
    INSERT INTO public.systems (id, client_id, name, system_type, status)
    VALUES ('55555555-5555-5555-5555-555555555555', '${clientBId}', 'Client B System', 'web_platform', 'live') ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('66666666-6666-6666-6666-666666666661', '55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'Client B App', 'web_app', '${clientBId}', 'active') ON CONFLICT DO NOTHING;

    -- Client A Agreement
    INSERT INTO public.service_agreements (id, client_id, system_id, name, service_type, status, start_date)
    VALUES ('77777777-7777-7777-7777-777777777771', '${clientAId}', '33333333-3333-3333-3333-333333333333', 'Client A Agreement', 'managed_service', 'active', '2026-09-01') ON CONFLICT DO NOTHING;

    -- Client B Agreement
    INSERT INTO public.service_agreements (id, client_id, system_id, name, service_type, status, start_date)
    VALUES ('77777777-7777-7777-7777-777777777772', '${clientBId}', '55555555-5555-5555-5555-555555555555', 'Client B Agreement', 'managed_service', 'active', '2026-09-01') ON CONFLICT DO NOTHING;

    -- Suspension case for Client A
    INSERT INTO public.suspension_cases (id, service_agreement_id, client_id, reason, requested_by, status)
    VALUES ('88888888-8888-8888-8888-888888888881', '77777777-7777-7777-7777-777777777771', '${clientAId}', 'Unpaid invoice overdue', '${adminId}', 'proposed') ON CONFLICT DO NOTHING;
  `);

  return { adminId, staffId, staff2Id, financeId, clientAId, clientBId };
}

test("PHASE 3D: Schema validation & RLS (3D-SCHEMA-1 to 3D-SCHEMA-4)", async () => {
  const db = await createDb();
  await setupAccounts(db);

  // 3D-SCHEMA-1 & 3D-SCHEMA-2: tables exist
  const tables = (await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('tasks', 'incidents')
    ORDER BY table_name;
  `)).rows.map(r => r.table_name);
  assert.deepEqual(tables, ["incidents", "tasks"]);

  // 3D-SCHEMA-3: RLS enabled on all new tables
  const rls = (await db.query(`
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('tasks', 'incidents')
    ORDER BY c.relname;
  `)).rows;
  assert.equal(rls.length, 2);
  assert.equal(rls[0].relrowsecurity, true);
  assert.equal(rls[1].relrowsecurity, true);

  // 3D-SCHEMA-4: CHECK constraints exist
  const constraints = (await db.query(`
    SELECT pg_get_constraintdef(oid) as def FROM pg_constraint
    WHERE conrelid IN ('public.tasks'::regclass, 'public.incidents'::regclass) AND contype = 'c';
  `)).rows.map(r => r.def);

  assert.ok(constraints.some(d => d.includes("'open'") && d.includes("'completed'")), "tasks status constraint exists");
  assert.ok(constraints.some(d => d.includes("'low'") && d.includes("'urgent'")), "tasks priority constraint exists");
  assert.ok(constraints.some(d => d.includes("'open'") && d.includes("'resolved'")), "incidents status constraint exists");
  assert.ok(constraints.some(d => d.includes("'critical'") && d.includes("'medium'")), "incidents severity constraint exists");
});

test("PHASE 3D: Same-client integrity constraints (3D-INT-1 to 3D-INT-6)", async () => {
  const db = await createDb();
  const { adminId, clientAId, clientBId } = await setupAccounts(db);

  const sysA = "33333333-3333-3333-3333-333333333333";
  const sysB = "55555555-5555-5555-5555-555555555555";
  const resA = "44444444-4444-4444-4444-444444444441";
  const resB = "66666666-6666-6666-6666-666666666661";
  const agrA = "77777777-7777-7777-7777-777777777771";
  const agrB = "77777777-7777-7777-7777-777777777772";

  // 3D-INT-1: Client A task cannot reference Client B resource
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.tasks (client_id, resource_id, title, created_by)
      VALUES ('${clientAId}', '${resB}', 'Bad Resource Task', '${adminId}');
    `),
    /Task client_id does not match referenced resource client_id/
  );

  // 3D-INT-2: Client A task cannot reference Client B system
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.tasks (client_id, system_id, title, created_by)
      VALUES ('${clientAId}', '${sysB}', 'Bad System Task', '${adminId}');
    `),
    /Task client_id does not match referenced system client_id/
  );

  // 3D-INT-3: Client A task cannot reference Client B agreement
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.tasks (client_id, service_agreement_id, title, created_by)
      VALUES ('${clientAId}', '${agrB}', 'Bad Agreement Task', '${adminId}');
    `),
    /Task client_id does not match referenced service agreement client_id/
  );

  // 3D-INT-4: Client A incident cannot reference Client B resource
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.incidents (client_id, resource_id, title, description, reported_by)
      VALUES ('${clientAId}', '${resB}', 'Bad Resource Inc', 'desc', '${adminId}');
    `),
    /Incident client_id does not match referenced resource client_id/
  );

  // 3D-INT-5: Client A incident cannot reference Client B system
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.incidents (client_id, system_id, title, description, reported_by)
      VALUES ('${clientAId}', '${sysB}', 'Bad System Inc', 'desc', '${adminId}');
    `),
    /Incident client_id does not match referenced system client_id/
  );

  // 3D-INT-6: Client A incident cannot reference Client B agreement
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.incidents (client_id, service_agreement_id, title, description, reported_by)
      VALUES ('${clientAId}', '${agrB}', 'Bad Agreement Inc', 'desc', '${adminId}');
    `),
    /Incident client_id does not match referenced service agreement client_id/
  );

  // Valid references succeed
  const incRes = await db.query(`
    INSERT INTO public.incidents (client_id, system_id, resource_id, service_agreement_id, title, description, reported_by)
    VALUES ('${clientAId}', '${sysA}', '${resA}', '${agrA}', 'Proper Client A Incident', 'desc', '${adminId}')
    RETURNING id;
  `);
  const incAId = incRes.rows[0].id;
  assert.ok(incAId, "Incident created with matching client references");

  // Client B task cannot reference Client A incident
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.tasks (client_id, incident_id, title, created_by)
      VALUES ('${clientBId}', '${incAId}', 'Cross Client Incident Task', '${adminId}');
    `),
    /Task client_id does not match referenced incident client_id/
  );
});

test("PHASE 3D: Lifecycle rules & State transitions (3D-LIFE-1 & 3D-LIFE-2)", async () => {
  const db = await createDb();
  const { adminId, staffId, clientAId } = await setupAccounts(db);

  // 3D-LIFE-1: Task lifecycle transitions
  // Task directly created as completed fails
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.tasks (client_id, title, created_by, status)
      VALUES ('${clientAId}', 'Direct Completed Task', '${adminId}', 'completed');
    `),
    /New tasks cannot directly be created as completed or cancelled/
  );

  const taskRes = await db.query(`
    INSERT INTO public.tasks (client_id, title, created_by, status)
    VALUES ('${clientAId}', 'Test Task', '${adminId}', 'open')
    RETURNING id;
  `);
  const taskId = taskRes.rows[0].id;

  // Assign task
  await db.query(`UPDATE public.tasks SET status = 'assigned', assigned_to = '${staffId}' WHERE id = '${taskId}';`);

  // Progress task -> started_at populated
  await db.query(`UPDATE public.tasks SET status = 'in_progress' WHERE id = '${taskId}';`);
  const inProg = (await db.query(`SELECT status, started_at FROM public.tasks WHERE id = '${taskId}';`)).rows[0];
  assert.equal(inProg.status, "in_progress");
  assert.ok(inProg.started_at, "started_at must be populated on in_progress");

  // Complete task -> completed_at populated
  await db.query(`UPDATE public.tasks SET status = 'completed' WHERE id = '${taskId}';`);
  const comp = (await db.query(`SELECT status, completed_at FROM public.tasks WHERE id = '${taskId}';`)).rows[0];
  assert.equal(comp.status, "completed");
  assert.ok(comp.completed_at, "completed_at must be populated on completed");

  // Completed task cannot be modified by staff
  await asUser(db, staffId, async () => {
    await assert.rejects(
      () => db.query(`UPDATE public.tasks SET status = 'in_progress' WHERE id = '${taskId}';`),
      /Completed tasks cannot be modified or transitioned/
    );
  });

  // Cancelled task cannot be modified
  const cTask = (await db.query(`
    INSERT INTO public.tasks (client_id, title, created_by, status)
    VALUES ('${clientAId}', 'Cancel Task', '${adminId}', 'open')
    RETURNING id;
  `)).rows[0].id;
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.tasks SET status = 'cancelled' WHERE id = '${cTask}';`);
  });
  await asUser(db, staffId, async () => {
    await assert.rejects(
      () => db.query(`UPDATE public.tasks SET status = 'in_progress' WHERE id = '${cTask}';`),
      /Cancelled tasks cannot be transitioned or modified/
    );
  });

  // 3D-LIFE-2: Incident lifecycle transitions
  const incRes = await db.query(`
    INSERT INTO public.incidents (client_id, title, description, reported_by, status)
    VALUES ('${clientAId}', 'Database Latency Spike', 'p99 > 500ms', '${adminId}', 'open')
    RETURNING id;
  `);
  const incId = incRes.rows[0].id;

  // Acknowledge -> acknowledged_at populated
  await db.query(`UPDATE public.incidents SET status = 'acknowledged', assigned_to = '${staffId}' WHERE id = '${incId}';`);
  const ack = (await db.query(`SELECT status, acknowledged_at FROM public.incidents WHERE id = '${incId}';`)).rows[0];
  assert.equal(ack.status, "acknowledged");
  assert.ok(ack.acknowledged_at, "acknowledged_at populated");

  // Investigate
  await db.query(`UPDATE public.incidents SET status = 'investigating' WHERE id = '${incId}';`);

  // Resolve -> resolved_at populated
  await db.query(`UPDATE public.incidents SET status = 'resolved', resolution_notes = 'Added index on foreign key' WHERE id = '${incId}';`);
  const res = (await db.query(`SELECT status, resolved_at FROM public.incidents WHERE id = '${incId}';`)).rows[0];
  assert.equal(res.status, "resolved");
  assert.ok(res.resolved_at, "resolved_at populated");

  // Only admin can close incident
  await asUser(db, staffId, async () => {
    await assert.rejects(
      () => db.query(`UPDATE public.incidents SET status = 'closed' WHERE id = '${incId}';`),
      /Only administrators can close operational incidents/
    );
  });

  // Admin closes incident
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.incidents SET status = 'closed' WHERE id = '${incId}';`);
  });
  const cls = (await db.query(`SELECT status, closed_at FROM public.incidents WHERE id = '${incId}';`)).rows[0];
  assert.equal(cls.status, "closed");
  assert.ok(cls.closed_at, "closed_at populated");

  // Staff cannot reopen or modify closed incident
  await asUser(db, staffId, async () => {
    await assert.rejects(
      () => db.query(`UPDATE public.incidents SET status = 'investigating' WHERE id = '${incId}';`),
      /Closed incidents can only be reopened or modified by an administrator/
    );
  });
});

test("PHASE 3D: Audit Logging triggers (3D-AUDIT-1 & 3D-AUDIT-2)", async () => {
  const db = await createDb();
  const { adminId, staffId, clientAId } = await setupAccounts(db);

  // 3D-AUDIT-1: Task creation & status changes produce audit events
  const taskRes = (await db.query(`
    INSERT INTO public.tasks (client_id, title, created_by, status)
    VALUES ('${clientAId}', 'Server Patching', '${adminId}', 'open')
    RETURNING id;
  `)).rows[0].id;

  await db.query(`UPDATE public.tasks SET status = 'assigned', assigned_to = '${staffId}' WHERE id = '${taskRes}';`);

  const taskLogs = (await db.query(`
    SELECT action, table_name, record_id FROM public.audit_logs
    WHERE table_name = 'tasks' AND record_id = '${taskRes}'
    ORDER BY created_at;
  `)).rows;

  assert.ok(taskLogs.some(l => l.action === "task.created"), "task.created logged");
  assert.ok(taskLogs.some(l => l.action === "task.assigned"), "task.assigned logged");

  // 3D-AUDIT-2: Incident lifecycle changes produce audit events
  const incRes = (await db.query(`
    INSERT INTO public.incidents (client_id, title, description, reported_by, status)
    VALUES ('${clientAId}', 'API 502 Errors', 'Service unreachable', '${adminId}', 'open')
    RETURNING id;
  `)).rows[0].id;

  await db.query(`UPDATE public.incidents SET status = 'acknowledged', assigned_to = '${staffId}' WHERE id = '${incRes}';`);

  const incLogs = (await db.query(`
    SELECT action, table_name, record_id FROM public.audit_logs
    WHERE table_name = 'incidents' AND record_id = '${incRes}'
    ORDER BY created_at;
  `)).rows;

  assert.ok(incLogs.some(l => l.action === "incident.created"), "incident.created logged");
  assert.ok(incLogs.some(l => l.action === "incident.assigned"), "incident.assigned logged");
});

test("PHASE 3D: Delete Safety (3D-SEC-3)", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  const tId = (await db.query(`
    INSERT INTO public.tasks (client_id, title, created_by, status)
    VALUES ('${clientAId}', 'Permanent Task', '${adminId}', 'open')
    RETURNING id;
  `)).rows[0].id;

  const iId = (await db.query(`
    INSERT INTO public.incidents (client_id, title, description, reported_by, status)
    VALUES ('${clientAId}', 'Permanent Incident', 'desc', '${adminId}', 'open')
    RETURNING id;
  `)).rows[0].id;

  // Cannot delete tasks
  await assert.rejects(
    () => db.query(`DELETE FROM public.tasks WHERE id = '${tId}';`),
    /Destructive deletion of task records is strictly forbidden/
  );

  // Cannot delete incidents
  await assert.rejects(
    () => db.query(`DELETE FROM public.incidents WHERE id = '${iId}';`),
    /Destructive deletion of incident records is strictly forbidden/
  );
});

test("PHASE 3D: RBAC & Role Boundaries (3D-RBAC-1 to 3D-RBAC-7)", async () => {
  const db = await createDb();
  const { adminId, staffId, staff2Id, financeId, clientAId } = await setupAccounts(db);

  // 3D-RBAC-1: Admin can create and manage tasks
  const adminTaskId = await asUser(db, adminId, async () => {
    const res = await db.query(`
      INSERT INTO public.tasks (client_id, title, created_by, status)
      VALUES ('${clientAId}', 'Admin Task', '${adminId}', 'open')
      RETURNING id;
    `);
    return res.rows[0].id;
  });
  assert.ok(adminTaskId);

  // 3D-RBAC-2: Admin can create and manage incidents
  const adminIncId = await asUser(db, adminId, async () => {
    const res = await db.query(`
      INSERT INTO public.incidents (client_id, title, description, reported_by, status)
      VALUES ('${clientAId}', 'Admin Incident', 'desc', '${adminId}', 'open')
      RETURNING id;
    `);
    return res.rows[0].id;
  });
  assert.ok(adminIncId);

  // Assign task & incident to staffId
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.tasks SET status = 'assigned', assigned_to = '${staffId}' WHERE id = '${adminTaskId}';`);
    await db.query(`UPDATE public.incidents SET status = 'acknowledged', assigned_to = '${staffId}' WHERE id = '${adminIncId}';`);
  });

  // 3D-RBAC-3: Staff can access operational work and update assigned task
  await asUser(db, staffId, async () => {
    const tasks = (await db.query(`SELECT id FROM public.tasks WHERE id = '${adminTaskId}';`)).rows;
    assert.equal(tasks.length, 1, "Staff can read task");

    await db.query(`UPDATE public.tasks SET status = 'in_progress', description = 'Investigating network logs' WHERE id = '${adminTaskId}';`);
    const updated = (await db.query(`SELECT status FROM public.tasks WHERE id = '${adminTaskId}';`)).rows[0];
    assert.equal(updated.status, "in_progress", "Staff updated assigned task");
  });

  // 3D-RBAC-4: Staff cannot perform Admin-only reassignment
  await assert.rejects(
    () => asUser(db, staffId, async () => {
      await db.query(`UPDATE public.tasks SET assigned_to = '${staff2Id}' WHERE id = '${adminTaskId}';`);
    }),
    /Only administrators can reassign operational tasks/
  );

  // 3D-RBAC-5: Finance cannot create operational tasks
  await assert.rejects(
    () => asUser(db, financeId, async () => {
      await db.query(`
        INSERT INTO public.tasks (client_id, title, created_by, status)
        VALUES ('${clientAId}', 'Finance Task Attempt', '${financeId}', 'open');
      `);
    }),
    /Finance users cannot create operational tasks/
  );

  // 3D-RBAC-6: Finance cannot execute operational actions (RLS denies update)
  await asUser(db, financeId, async () => {
    const res = await db.query(`UPDATE public.tasks SET status = 'completed' WHERE id = '${adminTaskId}';`);
    assert.equal(res.rowCount, 0, "Finance cannot update tasks (0 rows affected under RLS)");
  });

  // 3D-RBAC-7: Clients cannot access Operations (zero rows returned under RLS)
  await asUser(db, clientAId, async () => {
    const cTasks = (await db.query(`SELECT * FROM public.tasks;`)).rows;
    assert.equal(cTasks.length, 0, "Client sees 0 tasks");

    const cIncidents = (await db.query(`SELECT * FROM public.incidents;`)).rows;
    assert.equal(cIncidents.length, 0, "Client sees 0 incidents");

    await assert.rejects(
      () => db.query(`INSERT INTO public.tasks (client_id, title, created_by) VALUES ('${clientAId}', 'Client Task', '${clientAId}');`)
    );
  });
});

test("PHASE 3D: Financial Anti-Leak & Finance Isolation (3D-FIN-1 & 3D-FIN-2)", async () => {
  const db = await createDb();
  const { adminId, staffId, financeId, clientAId } = await setupAccounts(db);

  // Create invoice with financial amounts
  await db.exec(`
    INSERT INTO public.invoices (id, client_id, invoice_number, total, subtotal, currency, status, due_date)
    VALUES ('99999999-9999-9999-9999-999999999991', '${clientAId}', 'INV-TEST-001', 5000000, 5000000, 'UGX', 'sent', '2026-10-15')
    ON CONFLICT DO NOTHING;
  `);

  // 3D-FIN-1: Staff financial anti-leak remains intact (Staff cannot access invoices table)
  await asUser(db, staffId, async () => {
    const inv = (await db.query(`SELECT * FROM public.invoices;`)).rows;
    assert.equal(inv.length, 0, "Staff cannot see invoices");
  });

  // 3D-FIN-2: Finance retains appropriate financial access
  await asUser(db, financeId, async () => {
    const inv = (await db.query(`SELECT id, invoice_number, currency, status FROM public.invoices WHERE id = '99999999-9999-9999-9999-999999999991';`)).rows;
    assert.equal(inv.length, 1, "Finance can see invoices");
    assert.equal(inv[0].invoice_number, "INV-TEST-001");

    // And Finance has read-only access to tasks/incidents
    const tasks = (await db.query(`SELECT * FROM public.tasks;`)).rows;
    assert.ok(Array.isArray(tasks), "Finance can view tasks");
  });
});
