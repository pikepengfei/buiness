<script setup lang="ts">
/**
 * 顶部右侧用户信息组件
 *
 * 展示：公司全称 + 当前登录人姓名 + 角色职务；提供可用的退出登录
 * 数据来源：useAuthStore（登录人 /auth/me）+ cms.getSite（company_name 站点设置）
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { cms } from '@/api/cms';

const router = useRouter();
const auth = useAuthStore();

const user = computed(() => auth.user);

/** 角色 code → 职务显示名（与后端 roles 种子对齐，未知回退原 code） */
const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  editor: '内容编辑',
  operator: '运营',
};
const roleLabel = computed(() => {
  const code = user.value?.roleCode;
  if (!code) return '未登录';
  return ROLE_LABELS[code] || code;
});
const userName = computed(() => user.value?.displayName || user.value?.username || '未登录');
const avatarText = computed(() => (userName.value || '?').charAt(0));

/** 公司全称（来自站点设置 general.company_name） */
const companyName = ref('北京展创振华科技有限公司');

onMounted(async () => {
  try {
    if (!auth.user) await auth.fetchMe();
  } catch {
    /* 令牌失效由拦截器处理 */
  }
  try {
    const site = await cms.getSite();
    companyName.value = site.settings?.general?.company_name || companyName.value;
  } catch {
    /* 拉取失败保留默认公司名 */
  }
});

/** 退出登录：吊销会话 + 清理本地 + 跳转登录页 */
async function handleClickExit(): Promise<void> {
  try {
    await ElMessageBox.confirm('确认退出当前登录账号？', '退出登录', {
      type: 'warning',
      confirmButtonText: '退出',
      cancelButtonText: '取消',
    });
  } catch {
    return; // 用户取消
  }
  await auth.logout();
  router.replace('/login');
}
</script>

<template>
  <div class="header-right">
    <span class="company-label">{{ companyName }}</span>
    <span class="branching"></span>

    <el-popover placement="bottom" :width="220" trigger="hover">
      <template #reference>
        <div class="user-box">
          <el-avatar :size="34" class="user-avatar">{{ avatarText }}</el-avatar>
          <span class="user-name">{{ userName }}</span>
          <span class="user-role">{{ roleLabel }}</span>
        </div>
      </template>
      <div class="content-wrap">
        <div class="user-wrap">
          <el-avatar :size="48" class="user-avatar">{{ avatarText }}</el-avatar>
          <div class="user-content">
            <p class="name">{{ userName }}</p>
            <p class="user-code">{{ roleLabel }}</p>
          </div>
        </div>
        <el-tooltip :content="companyName">
          <div class="company-name">{{ companyName }}</div>
        </el-tooltip>
      </div>
    </el-popover>
    <span class="branching"></span>

    <div class="exit-box" @click="handleClickExit">
      <span class="exit-text">退出</span>
      <el-icon class="icon-right"><SwitchButton /></el-icon>
    </div>
  </div>
</template>

<style scoped>
.header-right {
  height: 50px;
  padding: 0 14px;
  background: #ffffff;
  border-radius: 8px;
  color: #222222;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-shrink: 0;
}
.company-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-box {
  display: flex;
  align-items: center;
  cursor: pointer;
}
.user-avatar {
  background: #de6420;
  color: #fff;
  font-weight: 600;
  flex-shrink: 0;
}
.user-name {
  margin-left: 10px;
  font-size: 16px;
  line-height: 22px;
}
.user-role {
  margin-left: 8px;
  font-size: 12px;
  color: #98a4b2;
  background: #f3f6fc;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.branching {
  display: block;
  height: 18px;
  width: 2px;
  background: #98a4b2;
  margin: 0 16px 0 16px;
}
.exit-box {
  display: flex;
  align-self: center;
  cursor: pointer;
  align-items: center;
  .exit-text {
    font-size: 16px;
    margin-right: 8px;
  }
  &:hover .exit-text,
  &:hover .icon-right {
    color: #de6420;
  }
}
.icon-right {
  font-size: 16px;
  color: #98a4b2;
}
.content-wrap .user-wrap {
  display: flex;
  align-items: center;
  p {
    margin: 0;
  }
  .user-content {
    margin-left: 8px;
    .name {
      font-size: 18px;
      color: #222;
    }
    .user-code {
      font-size: 14px;
      color: #98a4b2;
    }
  }
}
.content-wrap .company-name {
  background: #f3f6fc;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 4px 8px;
  border-radius: 4px;
  margin-top: 10px;
}
</style>
