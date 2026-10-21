<script setup lang="ts">
/**
 * 产品编辑页（新增/编辑）
 * body 对齐后端 POST/PATCH /products（camelCase）：
 *   slug,name,categoryId,series,coverImage,gallery[],summary,description,specs,highlights[],priceText,buyLink,status,sort
 * - coverImage / gallery：MediaPicker 选择
 * - specs：[{label,value}] 动态数组；highlights：字符串数组
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { ProductCategory } from '@/types/cms';
import MediaPicker from '../website/components/MediaPicker.vue';

const route = useRoute();
const router = useRouter();
const id = route.params.id ? Number(route.params.id) : null;
const isEdit = computed(() => id != null);

const loading = ref(false);
const saving = ref(false);
const cats = ref<ProductCategory[]>([]);

type Spec = { label: string; value: string };
const form = ref<any>({
  slug: '', name: '', categoryId: null, series: '', coverImage: '', gallery: [] as string[],
  summary: '', description: '', specs: [] as Spec[], highlights: [] as string[],
  priceText: '', buyLink: '', status: 1, sort: 0,
});

async function load() {
  loading.value = true;
  try {
    cats.value = await cmsAdmin.productCategories.list();
    if (id != null) {
      const p = await cmsAdmin.products.get(id);
      form.value = {
        slug: p.slug, name: p.name, categoryId: p.category_id, series: p.series || '',
        coverImage: p.cover_image || '', gallery: Array.isArray(p.gallery) ? p.gallery : [],
        summary: p.summary || '', description: p.description || '',
        specs: normalizeSpecs(p.specs), highlights: Array.isArray(p.highlights) ? p.highlights : [],
        priceText: p.price_text || '', buyLink: p.buy_link || '', status: p.status, sort: p.sort ?? 0,
      };
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// specs 兼容：数组直接用，对象映射转数组
function normalizeSpecs(raw: any): Spec[] {
  if (Array.isArray(raw)) return raw.map((s: any) => ({ label: s.label ?? '', value: s.value ?? '' }));
  if (raw && typeof raw === 'object') return Object.entries(raw).map(([label, value]) => ({ label, value: String(value) }));
  return [];
}

function addSpec() {
  form.value.specs.push({ label: '', value: '' });
}
function removeSpec(i: number) {
  form.value.specs.splice(i, 1);
}
function addHighlight() {
  form.value.highlights.push('');
}
function removeHighlight(i: number) {
  form.value.highlights.splice(i, 1);
}
function addGalleryImage() {
  form.value.gallery.push('');
}
function removeGalleryImage(i: number) {
  form.value.gallery.splice(i, 1);
}

async function submit() {
  if (!form.value.name.trim() || !form.value.slug.trim()) {
    ElMessage.warning('请填写产品名称与标识');
    return;
  }
  saving.value = true;
  const body = {
    ...form.value,
    categoryId: form.value.categoryId ?? undefined,
    specs: form.value.specs.filter((s: Spec) => s.label.trim()),
    highlights: form.value.highlights.filter((h: string) => h.trim()),
    gallery: form.value.gallery.filter((g: string) => g.trim()),
  };
  try {
    if (id != null) await cmsAdmin.products.update(id, body);
    else await cmsAdmin.products.create(body);
    ElMessage.success('保存成功');
    router.push('/admin/content');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

// ---- 图片选择（封面 / gallery 某索引）----
const picker = ref(false);
const pickerTarget = ref<{ type: 'cover' } | { type: 'gallery'; index: number } | null>(null);
function openCoverPicker() {
  pickerTarget.value = { type: 'cover' };
  picker.value = true;
}
function openGalleryPicker(index: number) {
  pickerTarget.value = { type: 'gallery', index };
  picker.value = true;
}
function onPicked(url: string) {
  const t = pickerTarget.value;
  if (!t) return;
  if (t.type === 'cover') form.value.coverImage = url;
  else form.value.gallery[t.index] = url;
}

function goBack() {
  router.push('/admin/content');
}
</script>

<template>
  <div v-loading="loading" class="pe">
    <el-card shadow="never" class="pe-bar">
      <div class="pe-bar-in">
        <span class="pe-title">{{ isEdit ? '编辑产品' : '新增产品' }}</span>
        <div>
          <el-button @click="goBack">返回列表</el-button>
          <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-form label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="产品名称" required>
              <el-input v-model="form.name" placeholder="如：Centremix 移动固态硬盘" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品标识" required>
              <el-input v-model="form.slug" placeholder="URL 片段，如：portable-ssd" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属分类">
              <el-select v-model="form.categoryId" clearable placeholder="选择产品分类" style="width: 100%">
                <el-option v-for="c in cats" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="系列">
              <el-input v-model="form.series" placeholder="如：LaCie Mobile" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="价格文案">
              <el-input v-model="form.priceText" placeholder="如：¥ 起 / 面议" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="购买链接">
              <el-input v-model="form.buyLink" placeholder="外链或内部路径" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序">
              <el-input-number v-model="form.sort" :min="0" :max="999" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="上架" inactive-text="下架" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="一句话简介">
          <el-input v-model="form.summary" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="详细描述">
          <el-input v-model="form.description" type="textarea" :rows="5" placeholder="支持基础 HTML，保存时后端清洗" />
        </el-form-item>

        <el-form-item label="封面图">
          <div class="pe-cover">
            <el-input v-model="form.coverImage" placeholder="封面 URL，或从媒体库选择" />
            <el-button @click="openCoverPicker">媒体库</el-button>
          </div>
          <img v-if="form.coverImage" :src="form.coverImage" class="pe-thumb" />
        </el-form-item>

        <el-form-item label="画廊图片">
          <div class="pe-gallery">
            <div v-for="(g, i) in form.gallery" :key="i" class="pe-gitem">
              <el-input v-model="form.gallery[i]" placeholder="图片 URL" size="small" />
              <el-button size="small" @click="openGalleryPicker(Number(i))">选图</el-button>
              <el-button size="small" type="danger" link @click="removeGalleryImage(Number(i))">删除</el-button>
            </div>
            <el-button plain type="primary" size="small" @click="addGalleryImage">+ 添加图片</el-button>
          </div>
        </el-form-item>

        <el-form-item label="规格参数">
          <div class="pe-list">
            <div v-for="(s, i) in form.specs" :key="i" class="pe-srow">
              <el-input v-model="s.label" placeholder="参数名，如：容量" size="small" style="width: 180px" />
              <el-input v-model="s.value" placeholder="参数值，如：2TB" size="small" style="flex: 1" />
              <el-button size="small" type="danger" link @click="removeSpec(Number(i))">删除</el-button>
            </div>
            <el-button plain type="primary" size="small" @click="addSpec">+ 添加规格</el-button>
          </div>
        </el-form-item>

        <el-form-item label="产品亮点">
          <div class="pe-list">
            <div v-for="(h, i) in form.highlights" :key="i" class="pe-srow">
              <el-input v-model="form.highlights[i]" placeholder="一条亮点描述" size="small" style="flex: 1" />
              <el-button size="small" type="danger" link @click="removeHighlight(Number(i))">删除</el-button>
            </div>
            <el-button plain type="primary" size="small" @click="addHighlight">+ 添加亮点</el-button>
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <MediaPicker v-model:visible="picker" @select="onPicked" />
  </div>
</template>

<style scoped>
.pe-bar {
  margin-bottom: 14px;
}
.pe-bar-in {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pe-title {
  font-weight: 600;
  font-size: 15px;
}
.pe-cover {
  display: flex;
  gap: 8px;
  width: 100%;
}
.pe-thumb {
  margin-top: 8px;
  width: 160px;
  height: 100px;
  object-fit: cover;
  border-radius: 6px;
  background: #f5f7fa;
}
.pe-gallery,
.pe-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pe-gitem,
.pe-srow {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
