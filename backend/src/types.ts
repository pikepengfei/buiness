import type { FastifyRequest } from 'fastify';

export interface AuthedUser {
  id: number;
  username: string;
  displayName: string;
  roleId: number;
  roleCode: string;
  permissions: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthedUser;
  }
}
