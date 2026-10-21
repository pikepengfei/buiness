<script setup lang="ts">
/**
 * 登录页
 *
 * - 对接后端 POST /api/auth/login（用户名 2–50 / 密码 6–100）
 * - 成功后写入 Pinia auth store（tokens + user），并跳转 redirect 或 /admin
 * - 支持「记住我」（仅缓存用户名，不缓存密码）
 * - 支持 Enter 提交
 */
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Lock, User } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

const REMEMBER_KEY = 'login.remember.username';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({
  username: '',
  password: '',
  remember: false,
});

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 50, message: '用户名长度 2–50 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 100, message: '密码长度 6–100 个字符', trigger: 'blur' },
  ],
};

onMounted(() => {
  const saved = localStorage.getItem(REMEMBER_KEY);
  if (saved) {
    form.username = saved;
    form.remember = true;
  }
});

function targetPath(): string {
  const r = (route.query.redirect as string) || '';
  // 仅允许站内路径，避免开放式重定向
  return r.startsWith('/') && !r.startsWith('//') ? r : '/admin';
}

async function handleSubmit() {
  if (!formRef.value) return;
  const ok = await formRef.value.validate().catch(() => false);
  if (!ok) return;

  loading.value = true;
  try {
    const user = await auth.login({ username: form.username, password: form.password });
    // 记住我：仅存用户名
    if (form.remember) localStorage.setItem(REMEMBER_KEY, form.username);
    else localStorage.removeItem(REMEMBER_KEY);

    ElMessage.success(`欢迎回来，${user.displayName || user.username}`);
    await router.replace(targetPath());
  } catch (err: any) {
    const msg =
      err?.response?.data?.message ||
      err?.message ||
      '登录失败，请检查用户名与密码';
    ElMessage.error(msg);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-brand">
      <img src="/website/img/logo-white.png" alt="Centremix" class="brand-logo" />
      <h1 class="brand-title">Centremix 芯联创</h1>
      <p class="brand-slogan">聚焦你的多元，存储你的生活</p>
      <ul class="brand-points">
        <li>企业官网 · 内容管理</li>
        <li>产品 · 资讯 · 线索一体化</li>
        <li>基于 RBAC 的多角色协作</li>
      </ul>
    </div>

    <div class="login-panel">
      <div class="panel-inner">
        <h2 class="panel-title">运营后台登录</h2>
        <p class="panel-sub">请输入管理员账号继续</p>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          @submit.prevent="handleSubmit"
        >
          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              :prefix-icon="User"
              placeholder="请输入用户名"
              autocomplete="username"
              clearable
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              :prefix-icon="Lock"
              type="password"
              placeholder="请输入密码"
              autocomplete="current-password"
              show-password
              @keyup.enter="handleSubmit"
            />
          </el-form-item>

          <div class="row-between">
            <el-checkbox v-model="form.remember">记住我</el-checkbox>
            <span class="tip">忘记密码？请联系超级管理员</span>
          </div>

          <el-button
            type="primary"
            class="submit-btn"
            :loading="loading"
            native-type="submit"
            @click.prevent="handleSubmit"
          >
            {{ loading ? '登录中…' : '登 录' }}
          </el-button>
        </el-form>

        <div class="panel-footer">
          <router-link to="/" class="link-back">← 返回官网首页</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  --brand: #de6420;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  min-height: 100vh;
  background: #f5f6f8;
}

/* 左侧品牌区 */
.login-brand {
  background:
    radial-gradient(1200px 600px at 90% -10%, rgba(255, 255, 255, 0.18), transparent 60%),
    linear-gradient(135deg, #c95314 0%, #de6420 45%, #ef8236 100%);
  color: #fff;
  padding: 72px 8vw;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
  position: relative;
  overflow: hidden;
}

.brand-logo {
  /* flex 列默认 align-items: stretch 会把 <img> 横向拉伸，
     这里强制 flex-start 不伸展 + 自然比例 + contain 保证不变形 */
  align-self: flex-start;
  height: 48px;
  width: auto;
  max-width: 220px;
  object-fit: contain;
  display: block;
  margin-bottom: 12px;
}

.brand-title {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: 1px;
  margin: 0;
}

.brand-slogan {
  font-size: 16px;
  opacity: 0.9;
  margin: 0 0 8px;
}

.brand-points {
  list-style: none;
  padding: 0;
  margin: 24px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
  opacity: 0.88;
}

.brand-points li::before {
  content: '●';
  color: rgba(255, 255, 255, 0.85);
  margin-right: 10px;
  font-size: 10px;
}

/* 右侧表单区 */
.login-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

.panel-inner {
  width: 100%;
  max-width: 400px;
  background: #fff;
  border-radius: 12px;
  padding: 40px 36px 28px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.06);
}

.panel-title {
  font-size: 22px;
  font-weight: 600;
  color: #222;
  margin: 0 0 4px;
}

.panel-sub {
  color: #888;
  font-size: 13px;
  margin: 0 0 24px;
}

.row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: -6px 0 18px;
}

.tip {
  color: #999;
  font-size: 12px;
}

.submit-btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  letter-spacing: 4px;
  background: var(--brand);
  border-color: var(--brand);
}

.submit-btn:hover,
.submit-btn:focus {
  background: #c95314;
  border-color: #c95314;
}

.panel-footer {
  margin-top: 20px;
  text-align: center;
}

.link-back {
  color: #999;
  font-size: 13px;
  text-decoration: none;
}

.link-back:hover {
  color: var(--brand);
}

/* 响应式：窄屏隐藏品牌区，只留表单 */
@media (max-width: 860px) {
  .login-page {
    grid-template-columns: 1fr;
  }
  .login-brand {
    display: none;
  }
  .login-panel {
    padding: 24px;
    background: linear-gradient(135deg, #de6420 0%, #ef8236 100%);
  }
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: #333;
  padding-bottom: 4px !important;
}

:deep(.el-input__wrapper) {
  border-radius: 6px;
}
</style>
