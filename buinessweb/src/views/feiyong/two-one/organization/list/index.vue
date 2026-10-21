<script lang="ts" setup>
/**
 * 费用管理-组织列表页面
 *
 * 核心职责：
 *   1. 展示费用申请列表
 *   2. 支持搜索筛选（申请单号、申请人、申请状态、申请部门、申请日期等）
 *   3. 支持新增、编辑、删除、查看详情操作
 *   4. 支持导出功能
 *
 * 特殊说明：
 *   - 支持 keep-alive 缓存，从详情页返回时保持筛选状态
 *   - 离开当前页面且不是去往详情页时，清除缓存
 */

import { reactive, ref, computed, onMounted, onActivated, onDeactivated } from 'vue';
import { Plus, EditPen, Delete, RefreshLeft, Search, Upload } from '@element-plus/icons-vue';
import type { FormInstance } from 'element-plus';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useRouter, onBeforeRouteLeave } from 'vue-router';
import { useKeepAliveStore } from '@/stores/keepAlive';

const keepStroe = useKeepAliveStore();

/** 缓存页面要用到 name */
defineOptions({
  name: 'feiyong-two-one-organization-list'
});

/** 搜索表单是否展开 */
const showForm = ref(true);
/** 高级搜索条件是否展开 */
const showMore = ref(false);
/** 表单 ref */
const formRef = ref<FormInstance>();
const router = useRouter();

/** 表格行数据类型 */
interface TableRow {
  code: string;
  name: string;
  department: string;
  date: string;
  type: string;
  reason: string;
  status: string;
  approvalStatus: string;
}

/** 搜索表单类型 */
interface SearchForm {
  code: string;
  name: string;
  department: string;
  status: string;
  date: string;
  reason: string;
  type: string;
}

/** 搜索表单数据 */
const sizeForm: SearchForm = reactive({
  code: '',
  name: '',
  department: '',
  status: '',
  date: '',
  reason: '',
  type: ''
});

/** 展开/收起文字 */
const showMoreText = computed(() => {
  return showMore.value ? '收起' : '展开';
});

/** 搜索表单展开/收起文字 */
const showText = computed(() => {
  return showForm.value ? '收起搜索条件' : '展开搜索条件';
});

/** 表格数据 */
const tableData: TableRow[] = [
  {
    code: 'CLFG4121231233123121',
    name: '张三',
    department: '技术部',
    date: '2023-10-12',
    type: '其他费用',
    reason: '采购经费',
    status: '已关联',
    approvalStatus: '审批通过'
  },
  {
    code: 'CLFG4121231233123122',
    name: '张三',
    department: '技术部',
    date: '2023-10-12',
    type: '其他费用',
    reason: '采购经费',
    status: '已关联',
    approvalStatus: '审批拒绝'
  }
];

// 生成模拟数据
for (let i = 0; i < 10; i++) {
  tableData.push({
    code: 'CLFG4121231233123123' + i,
    name: '张三',
    department: '技术部',
    date: '2023-10-12',
    type: '其他费用',
    reason: '采购经费',
    status: '已关联',
    approvalStatus: '审批中'
  });
}

/**
 * 根据审批状态返回对应的样式类名
 *
 * @param status - 审批状态
 * @returns 样式类名
 */
const classType = (status: string): string => {
  let className: string = '';
  switch (status) {
    case '审批中':
      className = 'examineing';
      break;
    case '审批拒绝':
      className = 'examine-faild';
      break;
    case '审批通过':
      className = 'approved';
      break;
  }
  return className;
};

/**
 * 切换搜索表单展开/收起
 */
const optForm = (): void => {
  showForm.value = !showForm.value;
};

/**
 * 清除查询条件
 *
 * @param formEl - 表单 ref
 */
const resetForm = (formEl: FormInstance | undefined): void => {
  if (!formEl) return;
  formEl.resetFields();
};

/**
 * 已选中的行
 */
const selectedRows = ref<TableRow[]>([]);

/**
 * 表格选中变化
 *
 * @param selection - 选中的行数组
 */
const handleSelectionChange = (selection: TableRow[]): void => {
  selectedRows.value = selection;
};

/**
 * 批量删除选中行
 */
const deleteSelected = (): void => {
  if (selectedRows.value.length === 0) {
    ElMessage({ message: '请先选择要删除的数据', type: 'warning' });
    return;
  }
  ElMessageBox.confirm(`确定要删除选中的 ${selectedRows.value.length} 条数据吗？`, '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      selectedRows.value.forEach((row) => {
        const index = tableData.indexOf(row);
        if (index > -1) tableData.splice(index, 1);
      });
      selectedRows.value = [];
      ElMessage({ message: '删除成功', type: 'success' });
    })
    .catch(() => {});
};

/**
 * 跳转到新增页面
 */
const goAdd = (): void => {
  router.push({ name: 'feiyong-two-one-organization-add' });
};

/**
 * 跳转到编辑页面
 *
 * @param code - 申请单号
 */
const goEdit = (code: string): void => {
  router.push({ name: 'feiyong-two-one-organization-add', query: { id: code } });
};

/**
 * 查看详情
 *
 * @param code - 申请单号
 */
const openDetail = (code: string): void => {
  router.push({
    name: 'feiyong-two-one-organization-detail',
    params: {
      id: code
    }
  });
};

// 生命周期
onMounted(() => {
  console.log('onMounted...feiyong/two-one/organization/list...');
});

onActivated(() => {
  console.log('onActivated...feiyong/two-one/organization/list...');
});

onDeactivated(() => {
  console.log('onDeactivated...feiyong/two-one/organization/list...');
});

/**
 * 在导航离开渲染该组件的对应路由时调用
 * 如果导航到不是详情页就不缓存
 */
onBeforeRouteLeave((to, from) => {
  if (to.name !== 'feiyong-two-one-organization-detail') {
    keepStroe.setNoKeepAlive(keepStroe.secondKeepAliveRoute, from.name as string);
  }
  return true;
});
</script>

<template>
  <el-card class="table-main">
    <!-- 搜索区域 -->
    <div class="search-section">
      <div class="search-header" @click="optForm">
        <div class="search-title">
          <span class="title-tag"></span>
          <span class="title-text">通用列表</span>
        </div>
        <div class="search-toggle">
          <el-icon class="toggle-icon">
            <component :is="showForm ? 'ArrowDown' : 'ArrowUp'"></component>
          </el-icon>
          <span class="toggle-text">{{ showText }}</span>
        </div>
      </div>

      <el-form
        ref="formRef"
        :inline="true"
        label-position="top"
        :model="sizeForm"
        label-width="auto"
        v-show="showForm"
        class="search-form"
      >
        <el-row :gutter="20">
          <el-col :span="6">
            <el-form-item label="申请单号" prop="code">
              <el-input v-model="sizeForm.code" placeholder="请输入申请单号" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="申请人" prop="name">
              <el-input v-model="sizeForm.name" placeholder="请输入申请人" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="申请状态" prop="status">
              <el-select
                v-model="sizeForm.status"
                placeholder="请选择申请状态"
                clearable
                style="width: 100%"
              >
                <el-option label="已关联" value="已关联" />
                <el-option label="未关联" value="未关联" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="申请部门" prop="department">
              <el-input v-model="sizeForm.department" placeholder="请输入申请部门" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="申请日期" prop="date">
              <el-date-picker
                v-model="sizeForm.date"
                type="date"
                placeholder="请选择申请日期"
                style="width: 100%"
                clearable
              />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="申请事由" prop="reason">
              <el-input v-model="sizeForm.reason" placeholder="请输入申请事由" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="类型" prop="type">
              <el-select
                v-model="sizeForm.type"
                placeholder="请选择类型"
                clearable
                style="width: 100%"
              >
                <el-option label="其他费用" value="其他费用" />
                <el-option label="差旅费用" value="差旅费用" />
                <el-option label="办公费用" value="办公费用" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="单据状态" prop="type">
              <el-select
                v-model="sizeForm.type"
                placeholder="请选择单据状态"
                clearable
                style="width: 100%"
              >
                <el-option label="审批中" value="审批中" />
                <el-option label="审批通过" value="审批通过" />
                <el-option label="审批拒绝" value="审批拒绝" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6" v-show="showMore">
            <el-form-item label="其他条件" prop="reason">
              <el-input v-model="sizeForm.reason" placeholder="请输入其他条件" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="6" class="btn-position">
            <el-form-item label=" ">
              <el-button :icon="Search" type="primary">查询</el-button>
              <el-button :icon="RefreshLeft" type="primary" plain @click="resetForm(formRef)">
                重置
              </el-button>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <!-- 展开/收起高级搜索 -->
      <div class="show-more" v-show="showForm" @click="showMore = !showMore">
        <span>
          {{ showMoreText }}
          <el-icon class="more-icon">
            <component :is="showMore ? 'ArrowUp' : 'ArrowDown'"></component>
          </el-icon>
        </span>
      </div>
    </div>

    <!-- 分割线 -->
    <div class="divider" v-show="showForm"></div>

    <!-- 操作按钮区域 -->
    <div class="table-options">
      <div class="options-left">
        <el-button :icon="Plus" type="primary" @click="goAdd()">新增</el-button>
        <el-button :icon="Delete" type="danger" @click="deleteSelected()">删除</el-button>
        <el-button :icon="Upload">导出</el-button>
      </div>
    </div>

    <!-- 表格区域 -->
    <el-table
      :data="tableData"
      style="width: 100%"
      class="data-table"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column type="index" label="编号" width="55" align="center" />
      <el-table-column prop="code" label="申请单号" width="200" :show-overflow-tooltip="true">
        <template #default="scope">
          <el-link type="primary" :underline="false" @click="openDetail(scope.row.code as string)">
            {{ scope.row.code }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="申请人" />
      <el-table-column prop="department" label="申请部门" />
      <el-table-column prop="date" label="申请日期" width="110" align="center" />
      <el-table-column prop="type" label="类型" />
      <el-table-column prop="reason" label="申请事由" />
      <el-table-column prop="status" label="单据状态" />
      <el-table-column prop="approvalStatus" label="审批状态" width="110" align="center">
        <template #default="scope">
          <span class="status-tag" :class="classType(scope.row.approvalStatus)">
            {{ scope.row.approvalStatus }}
          </span>
        </template>
      </el-table-column>
      <el-table-column fixed="right" label="操作" width="150" align="center">
        <template #default="scope">
          <el-button
            link
            type="primary"
            size="small"
            :icon="EditPen"
            @click="goEdit(scope.row.code as string)"
          >
            编辑
          </el-button>
          <el-button link type="primary" size="small" @click.prevent>撤回</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrap">
      <el-pagination
        layout="sizes,prev, pager, next"
        :page-sizes="[10, 20, 30, 50]"
        :total="tableData.length"
      ></el-pagination>
    </div>
  </el-card>
</template>

<style scoped>
/* 整体布局 */
.table-main {
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-page);
  border: none;
}

.table-main :deep(.el-card__body) {
  padding: 0px;
}

/* 搜索区域 */
.search-section {
  background: #ffffff;
  border-radius: 4px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
}

.search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.search-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.title-tag {
  display: inline-block;
  width: 3px;
  height: 14px;
  background: var(--el-color-primary);
  border-radius: 2px;
}

.title-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.search-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--el-color-primary);
  transition: color 0.2s;
  font-size: 12px;
}

.search-toggle:hover {
  color: var(--el-color-primary-light-3);
}

.toggle-icon {
  font-size: 12px;
  transition: transform 0.2s;
}

.search-form {
  padding: 0;
}

.search-form :deep(.el-form-item) {
  margin-bottom: 8px;
}

.search-form :deep(.el-form-item__label) {
  color: var(--el-text-color-regular);
  font-weight: 400;
  padding-bottom: 2px;
  font-size: 12px;
}

.search-form :deep(.el-input__wrapper),
.search-form :deep(.el-select__wrapper) {
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-position {
  display: flex;
  align-items: end;
}

.show-more {
  text-align: center;
  margin-top: 4px;
}

.show-more span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--el-color-primary);
  padding: 2px 10px;
  border-radius: 10px;
  transition: all 0.2s;
}

.show-more span:hover {
  background: var(--el-color-primary-light-9);
}

.more-icon {
  font-size: 12px;
  transition: transform 0.2s;
}

/* 分割线 */
.divider {
  height: 1px;
  background: var(--el-border-color-lighter);
  margin: 10px 0;
}

/* 操作按钮区域 */
.table-options {
  padding: 10px 0;
  display: flex;
  align-items: center;
}

.options-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 表格区域 */
.data-table {
  background: #ffffff;
  border-radius: 4px;
  margin-top: 10px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
}

.data-table :deep(.el-table__header th) {
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
  font-weight: 500;
  font-size: 12px;
}

.data-table :deep(.el-table__body tr:hover > td) {
  background: var(--el-fill-color-light);
}

.data-table :deep(.el-table__body td) {
  padding: 8px 0;
  font-size: 12px;
}

/* 状态标签 */
.status-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 400;
}

.status-tag::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  margin-right: 4px;
}

.examineing {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.examineing::before {
  background-color: var(--el-color-primary);
}

.examine-faild {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.examine-faild::before {
  background-color: var(--el-color-danger);
}

.approved {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.approved::before {
  background-color: var(--el-color-success);
}

/* 分页 */
.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 12px 0 0;
}

.pagination-wrap :deep(.el-pagination) {
  padding: 0;
}
</style>
