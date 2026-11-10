import express from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { asyncRoute } from '../middleware.js';
import { requireAdmin, requireAuth, requireStudent } from '../session.js';
import {
  MAX_EXAMINERS, SLOTS_PER_EXAMINER, adminDay, adminOverview, book, cancel, createDay, dayCsv,
  deleteDay, emailDetails, setExaminer, studentView, updateDay,
} from '../mockoral.js';

/* Mock oral booking: the student's page, and the teacher's setup behind it. */
const router = express.Router();
router.use(requireAuth);

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const examiners = z.number().int().min(1).max(MAX_EXAMINERS);
const slot = z.number().int().min(1).max(SLOTS_PER_EXAMINER);
const classIds = z.array(uuid).nullable();
const note = z.string().max(600);

function bad(res, message) {
  return res.status(400).json({ error: message });
}

/* ------------------------------------------------------------------ student */

router.get('/', requireStudent, asyncRoute(async (req, res) => {
  res.json(await studentView(req.user.id));
}));

router.post('/book', requireStudent, asyncRoute(async (req, res) => {
  const parsed = z.object({ dayId: uuid, slot }).safeParse(req.body);
  if (!parsed.success) return bad(res, 'Pick one of the times shown.');
  const result = await book({ ...parsed.data, studentId: req.user.id, actor: req.user });
  await audit({ actorId: req.user.id, action: 'mock_oral.booked', entityType: 'mock_oral_booking', entityId: result.booking.id,
    metadata: { slot: result.booking.slot, examiner: result.booking.examiner, date: result.booking.date }, ip: req.ip });
  res.status(201).json({ emailed: result.emailed, ...(await studentView(req.user.id)) });
}));

router.post('/cancel', requireStudent, asyncRoute(async (req, res) => {
  const parsed = z.object({ bookingId: uuid }).safeParse(req.body);
  if (!parsed.success) return bad(res, 'That booking is no longer there.');
  const result = await cancel({ bookingId: parsed.data.bookingId, actor: req.user });
  if (result.cancelled) {
    await audit({ actorId: req.user.id, action: 'mock_oral.cancelled', entityType: 'mock_oral_booking',
      entityId: parsed.data.bookingId, metadata: { by: 'student' }, ip: req.ip });
  }
  res.json({ emailed: result.emailed, ...(await studentView(req.user.id)) });
}));

/* -------------------------------------------------------------------- admin */

router.get('/admin', requireAdmin, asyncRoute(async (req, res) => {
  res.json(await adminOverview());
}));

router.post('/admin/days', requireAdmin, asyncRoute(async (req, res) => {
  const parsed = z.object({
    date, examiners, classIds: classIds.optional().default(null), note: note.optional().default(''),
  }).safeParse(req.body);
  if (!parsed.success) return bad(res, `Pick a date, and a number of examiners from 1 to ${MAX_EXAMINERS}.`);
  const id = await createDay({ ...parsed.data, actor: req.user });
  await audit({ actorId: req.user.id, action: 'mock_oral.day_created', entityType: 'mock_oral_day', entityId: id,
    metadata: { date: parsed.data.date, examiners: parsed.data.examiners }, ip: req.ip });
  res.status(201).json(await adminDay(id));
}));

router.get('/admin/days/:id', requireAdmin, asyncRoute(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'That mock oral day is no longer there.' });
  res.json(await adminDay(req.params.id));
}));

router.patch('/admin/days/:id', requireAdmin, asyncRoute(async (req, res) => {
  const parsed = z.object({
    date: date.optional(), examiners: examiners.optional(), bookingOpen: z.boolean().optional(),
    classIds: classIds.optional(), note: note.optional(),
  }).safeParse(req.body);
  if (!uuid.safeParse(req.params.id).success || !parsed.success) {
    return bad(res, `Pick a date, and a number of examiners from 1 to ${MAX_EXAMINERS}.`);
  }
  const result = await updateDay({ dayId: req.params.id, patch: parsed.data, actor: req.user });
  await audit({ actorId: req.user.id, action: 'mock_oral.day_updated', entityType: 'mock_oral_day', entityId: req.params.id,
    metadata: { ...parsed.data, studentsMoved: result.changed }, ip: req.ip });
  res.json({ changed: result.changed, emailed: result.emailed, ...(await adminDay(req.params.id)) });
}));

router.delete('/admin/days/:id', requireAdmin, asyncRoute(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'That mock oral day is no longer there.' });
  const result = await deleteDay({ dayId: req.params.id });
  await audit({ actorId: req.user.id, action: 'mock_oral.day_deleted', entityType: 'mock_oral_day', entityId: req.params.id,
    metadata: { bookingsCancelled: result.cancelled }, ip: req.ip });
  res.json(result);
}));

router.put('/admin/days/:id/examiners/:number', requireAdmin, asyncRoute(async (req, res) => {
  const parsed = z.object({ name: z.string().max(80).optional().default(''), link: z.string().max(500).optional().default('') }).safeParse(req.body);
  const number = Number(req.params.number);
  if (!uuid.safeParse(req.params.id).success || !parsed.success || !Number.isInteger(number)) {
    return bad(res, 'Check the name and the link.');
  }
  await setExaminer({ dayId: req.params.id, number, ...parsed.data });
  res.json(await adminDay(req.params.id));
}));

/* The teacher placing a student by hand, in a cell of the grid. */
router.post('/admin/days/:id/bookings', requireAdmin, asyncRoute(async (req, res) => {
  const parsed = z.object({ studentId: uuid, slot, examiner: examiners.optional() }).safeParse(req.body);
  if (!uuid.safeParse(req.params.id).success || !parsed.success) return bad(res, 'Pick a student and a time.');
  const result = await book({
    dayId: req.params.id, studentId: parsed.data.studentId, slot: parsed.data.slot,
    examiner: parsed.data.examiner ?? null, actor: req.user,
  });
  await audit({ actorId: req.user.id, action: 'mock_oral.booked', entityType: 'mock_oral_booking', entityId: result.booking.id,
    metadata: { by: 'teacher', studentId: parsed.data.studentId, slot: result.booking.slot, examiner: result.booking.examiner }, ip: req.ip });
  res.status(201).json({ emailed: result.emailed, ...(await adminDay(req.params.id)) });
}));

router.delete('/admin/bookings/:id', requireAdmin, asyncRoute(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'That booking is no longer there.' });
  const result = await cancel({ bookingId: req.params.id, actor: req.user });
  if (result.cancelled) {
    await audit({ actorId: req.user.id, action: 'mock_oral.cancelled', entityType: 'mock_oral_booking', entityId: req.params.id,
      metadata: { by: 'teacher', studentId: result.student.id }, ip: req.ip });
  }
  res.json({ cancelled: result.cancelled, emailed: result.emailed });
}));

router.post('/admin/days/:id/email-details', requireAdmin, asyncRoute(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'That mock oral day is no longer there.' });
  const result = await emailDetails({ dayId: req.params.id });
  await audit({ actorId: req.user.id, action: 'mock_oral.details_emailed', entityType: 'mock_oral_day', entityId: req.params.id,
    metadata: result, ip: req.ip });
  res.json(result);
}));

router.get('/admin/days/:id/export.csv', requireAdmin, asyncRoute(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'That mock oral day is no longer there.' });
  const { date: day, csv } = await dayCsv(req.params.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="mock-orals-${day}.csv"`);
  res.send(`﻿${csv}`);
}));

export default router;
