import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { userRoutes } from './users.js';
import { contentRoutes } from './content.js';
import { formRoutes } from './forms.js';
import { uploadRoutes } from './upload.js';
import { publicRoutes } from './public.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(contentRoutes);
  await app.register(formRoutes);
  await app.register(uploadRoutes);
  await app.register(publicRoutes);
}
