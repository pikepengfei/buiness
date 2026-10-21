<script setup lang="ts">
/**
 * 资讯编辑页（新增/编辑）
 * body 对齐后端 POST/PATCH /articles：slug,title,coverImage,categoryId,summary,body,tags[],author,status
 * 正文用 HTML 源码编辑，右侧可切换渲染预览（不引入富文本依赖）
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { ArticleCategory } from '@/types/cms';
import MediaPicker from '../website/components/MediaPicker.vue';

const route = useRoute();
const router = useRouter();
const id = route.params.id ? Number(route.params.id) : null;
const isEdit = computed(() => id != null);

const loading = ref(false);
const saving = ref(false);
const cats = ref<ArticleCategory[]>([]);
const preview = ref(false);

const form = ref<any>({
  slug: '', title: '', coverImage: '', categoryId: null, summary: '',
  body: '', tags: [] as string[], author: '', status: 0,
});
const tagInput = ref('');

async function load() {
  loading.value = true;
  try {
    cats.value = await cmsAdmin.articleCategories.list();
    if (id != null) {
      const a = await cmsAdmin.articles.get(id);
      form.value = {
        slug: a.slug, title: a.title, coverImage: a.cover_image || '', categoryId: a.category_id,
        summary: a.summary || '', body: a.body || '', tags: Array.isArray(a.tags) ? a.tags : [],
        author: a.author || '', status: a.status,
      };
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function addTag() {
  const t = tagInput.value.trim();
  if (t && !form.value.tags.includes(t)) form.value.tags.push(t);
  tagInput.value = '';
}
function removeTag(i: number) {
  form.value.tags.splice(i, 1);
}

async function submit() {
  if (!form.value.title.trim() || !form.value.slug.trim()) {
    ElMessage.warning('请填写标题与标识');
    return;
  }
  saving.value = true;
  const body = { ...form.value, categoryId: form.value.categoryId ?? undefined };
  try {
    if (id != null) await cmsAdmin.articles.update(id, body);
    else await cmsAdmin.articles.create(body);
    ElMessage.success('保存成功');
    router.push('/admin/content/articles');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

const picker = ref(false);
function onPicked(url: string) {
  form.value.coverImage = url;
}
function goBack() {
  router.push('/admin/content/articles');
}
</script>

<template>
  <div v-loading="loading" class="ae">
    <el-card shadow="never" class="ae-bar">
      <div class="ae-bar-in">
        <span class="ae-title">{{ isEdit ? '编辑资讯' : '新增资讯' }}</span>
        <div>
          <el-button @click="goBack">返回列表</el-button>
          <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-form label-width="90px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="标题" required>
              <el-input v-model="form.title" placeholder="资讯标题" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="标识" required>
              <el-input v-model="form.slug" placeholder="URL 片段，如：launch-2024" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="分类">
              <el-select v-model="form.categoryId" clearable placeholder="选择分类" style="width: 100%">
                <el-option v-for="c in cats" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="作者">
              <el-input v-model="form.author" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width: 100%">
                <el-option label="草稿" :value="0" />
                <el-option label="已发布" :value="1" />
                <el-option label="已下架" :value="2" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="摘要">
          <el-input v-model="form.summary" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="封面图">
          <div class="ae-cover">
            <el-input v-model="form.coverImage" placeholder="封面 URL，或从媒体库选择" />
            <el-button @click="picker = true">媒体库</el-button>
          </div>
          <img v-if="form.coverImage" :src="form.coverImage" class="ae-thumb" />
        </el-form-item>

        <el-form-item label="标签">
          <div class="ae-tags">
            <el-tag v-for="(t, i) in form.tags" :key="i" closable class="ae-tag" @close="removeTag(Number(i))">{{ t }}</el-tag>
            <el-input v-model="tagInput" size="small" style="width: 160px" placeholder="输入后回车添加" @keyup.enter="addTag" />
            <el-button size="small" @click="addTag">添加</el-button>
          </div>
        </el-form-item>

        <el-form-item label="正文">
          <div class="ae-body">
            <div class="ae-body-head">
              <el-radio-group v-model="preview" size="small">
                <el-radio-button :value="false">HTML 源码</el-radio-button>
                <el-radio-button :value="true">渲染预览</el-radio-button>
              </el-radio-group>
            </div>
            <el-input v-if="!preview" v-model="form.body" type="textarea" :rows="16" placeholder="正文 HTML，保存时后端清洗" />
            <div v-else class="ae-render" v-html="form.body"></div>
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <MediaPicker v-model:visible="picker" @select="onPicked" />
  </div>
</template>

<style scoped>
.ae-bar {
  margin-bottom: 14px;
}
.ae-bar-in {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ae-title {
  font-weight: 600;
  font-size: 15px;
}
.ae-cover {
  display: flex;
  gap: 8px;
  width: 100%;
}
.ae-thumb {
  margin-top: 8px;
  width: 160px;
  height: 90px;
  object-fit: cover;
  border-radius: 6px;
  background: #f5f7fa;
}
.ae-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ae-body {
  width: 100%;
}
.ae-body-head {
  margin-bottom: 8px;
}
.ae-render {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 16px;
  min-height: 320px;
  overflow: auto;
}
</style>
