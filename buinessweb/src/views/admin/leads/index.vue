<script setup lang="ts">
/**
 * 转化线索：询价 / 合作 / 售后 三 Tab，看板统计 + 列表 + 处理（状态流转/备注/处理人）
 * 数据 kind 对应后端 /leads/:kind（inquiry/cooperation/contact），更新 PATCH /leads/:kind/:id
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { LeadRow } from '@/types/cms';

type Kind = 'inquiry' | 'cooperation' | 'contact';
const activeKind = ref<Kind>('inquiry');
const rows = ref<LeadRow[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const filterStatus = ref<number | ''>('');

const TABS: { key: Kind; label: string; table: string }[] = [
  { key: 'inquiry', label: '产品询价', table: 'inquiries' },
  { key: 'cooperation', label: '合作申请', table: 'cooperation' },
  { key: 'contact', label: '售后/联系', table: 'contact_messages' },
];

async function load() {
  loading.value = true;
  try {
    const params: Record<string, any> = { page: page.value, pageSize: pageSize.value };
    if (filterStatus.value !== '') params.status = filterStatus.value;
    const res = await cmsAdmin.leads.list(activeKind.value, params);
    rows.value = res.list;
    total.value = res.total;
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
function switchTab(k: Kind) {
  activeKind.value = k;
  page.value = 1;
  filterStatus.value = '';
  load();
}

// 看板统计
const stats = ref<Record<string, any>>({});
async function loadStats() {
  try {
    stats.value = await cmsAdmin.leads.stats();
  } catch {
    /* 统计失败不阻断列表 */
  }
}
onMounted(() => {
  load();
  loadStats();
});
const statCards = computed(() =>
  TABS.map((t) => {
    const s = stats.value[t.table] || {};
    const sum = Object.values(s).reduce((a: number, b: any) => a + Number(b), 0);
    return { label: t.label, total: sum, pending: Number(s['0'] || 0), kind: t.key };
  })
);

const STATUS: Record<number, { text: string; type: string }> = {
  0: { text: '待处理', type: 'danger' },
  1: { text: '处理中', type: 'warning' },
  2: { text: '已完成', type: 'success' },
};

// 处理弹窗
const dlg = ref(false);
const saving = ref(false);
const cur = ref<LeadRow | null>(null);
const form = ref<{ status: number; note: string; handledBy: string }>({ status: 0, note: '', handledBy: '' });
function openHandle(row: LeadRow) {
  cur.value = row;
  form.value = { status: row.status ?? 0, note: row.note || '', handledBy: row.handled_by || '' };
  dlg.value = true;
}
async function submitHandle() {
  if (!cur.value) return;
  saving.value = true;
  try {
    await cmsAdmin.leads.update(activeKind.value, cur.value.id, form.value);
    ElMessage.success('已更新');
    dlg.value = false;
    load();
    loadStats();
  } catch (e: any) {
    ElMessage.error(e?.message || '更新失败');
  } finally {
    saving.value = false;
  }
}

// 列展示：根据 kind 取不同明细列
const detailCols = computed<{ prop: string; label: string }[]>(() => {
  const base = [{ prop: 'phone', label: '电话' }, { prop: 'email', label: '邮箱' }];
  if (activeKind.value === 'inquiry') return [{ prop: 'company', label: '公司' }, { prop: 'need_type', label: '需求类型' }, ...base];
  if (activeKind.value === 'cooperation') return [{ prop: 'company', label: '公司' }, { prop: 'coop_type', label: '合作类型' }, ...base];
  return [{ prop: 'type', label: '类型' }, ...base];
});
function fmt(v: string | null) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '—';
}
</script>

<template>
  <div class="leads">
    <!-- 看板 -->
    <el-row :gutter="14" class="ld-stats">
      <el-col v-for="c in statCards" :key="c.kind" :span="8">
        <el-card shadow="never" class="ld-stat-card" @click="switchTab(c.kind)">
          <div class="ld-sc-label">{{ c.label }}</div>
          <div class="ld-sc-num">{{ c.total }}</div>
          <div class="ld-sc-sub">待处理 {{ c.pending }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never">
      <el-tabs v-model="activeKind" @tab-change="(k: string) => switchTab(k as Kind)">
        <el-tab-pane v-for="t in TABS" :key="t.key" :label="t.label" :name="t.key" />
      </el-tabs>

      <div class="ld-toolbar">
        <span class="ld-count">共 {{ total }} 条</span>
        <el-select v-model="filterStatus" placeholder="全部状态" clearable size="small" style="width: 140px" @change="() => { page = 1; load(); }">
          <el-option label="待处理" :value="0" />
          <el-option label="处理中" :value="1" />
          <el-option label="已完成" :value="2" />
        </el-select>
      </div>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="name" label="联系人" width="110" />
        <el-table-column v-for="col in detailCols" :key="col.prop" :prop="col.prop" :label="col.label" min-width="120" show-overflow-tooltip />
        <el-table-column prop="message" label="留言" min-width="200" show-overflow-tooltip />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="(STATUS[row.status]?.type as any) || 'info'" size="small">{{ STATUS[row.status]?.text || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="160">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openHandle(row)">处理</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pager"
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="(p: number) => { page = p; load(); }"
      />
    </el-card>

    <el-dialog v-model="dlg" title="处理线索" width="520px">
      <template v-if="cur">
        <el-descriptions :column="1" border size="small" class="ld-desc">
          <el-descriptions-item label="联系人">{{ cur.name }}</el-descriptions-item>
          <el-descriptions-item v-for="col in detailCols" :key="col.prop" :label="col.label">
            {{ cur[col.prop] || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="留言">{{ cur.message || '—' }}</el-descriptions-item>
        </el-descriptions>
        <el-form label-width="80px" class="ld-form">
          <el-form-item label="状态">
            <el-radio-group v-model="form.status">
              <el-radio-button :value="0">待处理</el-radio-button>
              <el-radio-button :value="1">处理中</el-radio-button>
              <el-radio-button :value="2">已完成</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="处理人">
            <el-input v-model="form.handledBy" placeholder="跟进人姓名" />
          </el-form-item>
          <el-form-item label="处理备注">
            <el-input v-model="form.note" type="textarea" :rows="3" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitHandle">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ld-stats {
  margin-bottom: 14px;
}
.ld-stat-card {
  cursor: pointer;
}
.ld-sc-label {
  font-size: 13px;
  color: #909399;
}
.ld-sc-num {
  font-size: 28px;
  font-weight: 700;
  margin: 4px 0;
}
.ld-sc-sub {
  font-size: 12px;
  color: #e6a23c;
}
.ld-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.ld-count {
  font-size: 13px;
  color: #909399;
}
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}
.ld-desc {
  margin-bottom: 16px;
}
</style>
