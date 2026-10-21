/**
 * 认证 Store
 *
 * 核心职责：
 *   1. 集中管理 accessToken / refreshToken / 用户信息
 *   2. 与后端 /api/auth/* 对齐：login / logout / fetchMe / refresh / hasPerm
 *   3. 令牌持久化到 localStorage（沿用 cms.ts 中 axios 拦截器读取的同一 Key）
 *
 * 注意：
 *   - 后端刷新采用「令牌轮换」：refresh() 会同时返回新的 access 与 refresh，
 *     必须一起持久化，否则旧 refresh 下次刷新会被拒绝（401/2006）。
 *   - 超级管理员权限点为 ["*"]，hasPerm 需特殊放行。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi } from '@/api/cms';
import type { AuthUser, LoginPayload } from '@/types/cms';

const AT_KEY = 'Authorization';
const RT_KEY = 'RefreshToken';

export const useAuthStore = defineStore('auth', () => {
  /** 访问令牌（JWT） */
  const accessToken = ref<string>(localStorage.getItem(AT_KEY) || '');
  /** 刷新令牌（一次性轮换） */
  const refreshToken = ref<string>(localStorage.getItem(RT_KEY) || '');
  /** 当前登录用户信息（登录后从 /auth/me 拉取） */
  const user = ref<AuthUser | null>(null);

  /** 是否已登录（存在 accessToken 即视为已登录；实际有效性由接口返回 401 判定） */
  const isLogged = computed(() => !!accessToken.value);

  function persistTokens(at: string, rt?: string) {
    accessToken.value = at;
    localStorage.setItem(AT_KEY, at);
    if (rt) {
      refreshToken.value = rt;
      localStorage.setItem(RT_KEY, rt);
    }
  }

  function clear() {
    accessToken.value = '';
    refreshToken.value = '';
    user.value = null;
    localStorage.removeItem(AT_KEY);
    localStorage.removeItem(RT_KEY);
  }

  /** 登录：成功写入 tokens 与 user */
  async function login(payload: LoginPayload): Promise<AuthUser> {
    const data = await authApi.login(payload);
    persistTokens(data.accessToken, data.refreshToken);
    user.value = data.user;
    return data.user;
  }

  /** 拉取当前用户（用于路由守卫判断/校验令牌有效性） */
  async function fetchMe(): Promise<AuthUser | null> {
    if (!accessToken.value) return null;
    try {
      user.value = await authApi.me();
      return user.value;
    } catch (e) {
      clear();
      throw e;
    }
  }

  /** 使用 refreshToken 换取新的一对令牌（后端轮换） */
  async function refresh(): Promise<boolean> {
    if (!refreshToken.value) return false;
    try {
      const data = await authApi.refresh(refreshToken.value);
      persistTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      clear();
      return false;
    }
  }

  /** 登出：吊销服务端会话并清空本地 */
  async function logout(): Promise<void> {
    try {
      if (refreshToken.value) await authApi.logout();
    } catch {
      /* 网络失败仍要清理本地登录态 */
    } finally {
      clear();
    }
  }

  /** 权限点判断：super_admin 的 "*" 通配放行 */
  function hasPerm(perm: string): boolean {
    const perms = user.value?.permissions ?? [];
    return perms.includes('*') || perms.includes(perm);
  }

  return {
    accessToken,
    refreshToken,
    user,
    isLogged,
    login,
    logout,
    fetchMe,
    refresh,
    hasPerm,
    clear,
  };
});
