<script setup lang="ts">
/**
 * 新建页面（= 新增顶部导航页面）对话框
 *
 * 目前仅「官网配置-导航菜单 → 新增顶部导航页面」保留入口；页面装修页只做装修与发布管理。
 * 表单字段、校验口径、后端事务（页面记录 + 顶栏行同事务落库）、站点配置刷新、
 * 创建后进入装修编辑器都收敛在此组件内，避免入口调整时逻辑散落。
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import { useSiteStore } from '@/stores/site';
import { normalizePageSlug, validatePageSlug, pagePath } from '@/website/pageRoutes';

const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ created: [slug: string] }>();

const router = useRouter();
const site = useSiteStore();
const creating = ref(false);
const form = ref({ slug: '', title: '' });

// 每次打开重置表单；两个入口的按钮只负责把 v-model 置为 true
watch(visible, (open) => {
  if (open) form.value = { slug: '', title: '' };
});

function close() {
  visible.value = false;
}

// 标识预览：粘贴 /company s 之类的脏输入时，先把整理结果给运营看，避免提交才报错
const slugPreview = computed(() => normalizePageSlug(form.value.slug));
function onSlugBlur() {
  const normalized = slugPreview.value;
  if (normalized && normalized !== form.value.slug) form.value.slug = normalized;
}

async function submit() {
  // 一律使用规范化后的标识：去零宽字符/斜杠前缀、小写、空格转中划线
  const slug = normalizePageSlug(form.value.slug);
  const title = form.value.title.trim();
  if (!title) {
    ElMessage.warning('请填写页面标题');
    return;
  }
  const err = validatePageSlug(slug);
  if (err) {
    ElMessage.warning(err);
    return;
  }
  creating.value = true;
  try {
    // 后端在同一事务里写 pages 记录 + 顶部 tab 行，创建完即可进入编辑器装修
    await cmsAdmin.pages.create({ slug, title, contentJson: { blocks: [] } });
    // 让已打开的官网页面下一次取站点配置时拿到新栏目（no-cache + ETag 会自然失效）
    void Promise.resolve(site.ensureLoaded(true)).catch(() => {});
    ElMessage.success(`页面已创建，顶部导航「${pagePath(slug)}」已同步生成`);
    emit('created', slug);
    close();
    router.push(`/admin/pages/editor/${slug}`);
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="新建页面（同步生成顶部导航栏目）" width="440px">
    <el-form label-width="90px">
      <el-form-item label="页面标识">
        <el-input v-model="form.slug" placeholder="如：companys（小写字母/数字/中划线）" @blur="onSlugBlur" />
        <div class="cpd-tip">
          只需填标识本身，不要带 / 和空格；粘贴「/company s」会自动整理成「company-s」，零宽不可见字符会自动去除。
          创建后地址：<code>{{ slugPreview ? pagePath(slugPreview) : '/{标识}' }}</code>，并自动生成官网顶部导航栏目。
        </div>
      </el-form-item>
      <el-form-item label="页面标题">
        <el-input v-model="form.title" placeholder="如：解决方案（同时作为导航显示名称）" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="creating" @click="submit">创建并装修</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.cpd-tip {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  line-height: 1.7;
}
.cpd-tip code {
  background: #f5f7fa;
  padding: 1px 5px;
  border-radius: 3px;
  color: #606266;
}
</style>
