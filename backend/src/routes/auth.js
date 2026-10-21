import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { sign } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/errors.js';

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80),
  phone: z.string().optional(),
});

authRouter.post(
  '/fan/signup',
  asyncRoute(async (req, res) => {
    const body = signupSchema.parse(req.body);
    const existing = await prisma.fan.findUnique({ where: { email: body.email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const passwordHash = await bcrypt.hash(body.password, 12);
    const fan = await prisma.fan.create({
      data: { email: body.email, passwordHash, name: body.name, phone: body.phone },
    });
    const token = sign({ sub: fan.id, kind: 'fan' });
    res.status(201).json({ token, fan: { id: fan.id, name: fan.name, email: fan.email } });
  })
);

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

authRouter.post(
  '/fan/login',
  asyncRoute(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const fan = await prisma.fan.findUnique({ where: { email: body.email } });
    if (!fan || !(await bcrypt.compare(body.password, fan.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = sign({ sub: fan.id, kind: 'fan' });
    res.json({ token, fan: { id: fan.id, name: fan.name, email: fan.email } });
  })
);

// Get-or-create a single fixed demo fan, matching the front-end prototype's
// hardcoded "Alex R." identity. Lets the live demo exercise real auth + real
// push without needing a signup UI yet — not a bypass of the auth system,
// just a consistent identity for it.
authRouter.post(
  '/fan/demo',
  asyncRoute(async (req, res) => {
    const email = 'alex.demo@coloradobassheads.com';
    const fan = await prisma.fan.upsert({
      where: { email },
      update: {},
      create: { email, name: 'Alex R.', passwordHash: await bcrypt.hash(`demo-${Date.now()}`, 4) },
    });
    const token = sign({ sub: fan.id, kind: 'fan' });
    res.json({ token, fan: { id: fan.id, name: fan.name, email: fan.email } });
  })
);

authRouter.post(
  '/owner/login',
  asyncRoute(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const owner = await prisma.owner.findUnique({ where: { email: body.email } });
    if (!owner || !(await bcrypt.compare(body.password, owner.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = sign({ sub: owner.id, kind: 'owner', role: owner.role });
    res.json({ token, owner: { id: owner.id, name: owner.name, role: owner.role } });
  })
);
