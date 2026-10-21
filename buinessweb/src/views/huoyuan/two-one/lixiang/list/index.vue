<script lang="ts" setup>
/**
 * 用户管理页面
 *
 * 核心职责：
 *   1. 展示组织机构树形结构
 *   2. 展示用户列表，支持搜索筛选
 *   3. 支持新增、编辑、导出、删除操作
 *
 * 特殊说明：
 *   - 左侧为组织机构树，右侧为用户表格
 *   - 点击组织机构树节点可筛选对应用户
 */

import { reactive, ref } from 'vue';
import {
  Plus,
  EditPen,
  Delete,
  Search,
  RefreshRight,
  Download,
  Setting,
  OfficeBuilding,
  Folder,
  User
} from '@element-plus/icons-vue';
import type { FormInstance } from 'element-plus';
import { ElMessageBox, ElMessage } from 'element-plus';

/** 搜索表单 ref */
const searchFormRef = ref<FormInstance>();
/** 新建/编辑对话框显示状态 */
const dialogVisible = ref(false);
/** 对话框类型：add-新建，edit-编辑 */
const dialogType = ref<'add' | 'edit'>('add');
/** 提交按钮加载状态 */
const submitLoading = ref(false);
/** 对话框表单 ref */
const dialogFormRef = ref<FormInstance>();
/** 当前选中的组织节点 */
const selectedOrgNode = ref<string>('');

/** 搜索表单类型 */
interface SearchForm {
  keyword: string;
  status: string;
}

/** 搜索表单数据 */
const searchForm: SearchForm = reactive({
  keyword: '',
  status: ''
});

/** 用户表格行数据类型 */
interface UserRow {
  id: number;
  username: string;
  name: string;
  department: string;
  phone: string;
  gender: string;
  position: string;
  status: string;
}

/** 对话框表单数据类型 */
interface DialogForm {
  username: string;
  name: string;
  department: string;
  phone: string;
  gender: string;
  position: string;
  status: string;
}

/** 对话框表单数据 */
const dialogFormData: DialogForm = reactive({
  username: '',
  name: '',
  department: '',
  phone: '',
  gender: '',
  position: '',
  status: '正常'
});

/** 组织机构树数据 */
const orgTreeData = [
  {
    id: '1',
    label: '中国中煤能源集团有限公司',
    icon: 'company',
    children: [
      {
        id: '1-1',
        label: '集团公司',
        icon: 'folder',
        children: [
          { id: '1-1-1', label: '上海大屯能源股份有限公司', icon: 'user' },
          { id: '1-1-2', label: '中煤新焦能源股份有限公司', icon: 'user' },
          { id: '1-1-3', label: '中煤华晋集团有限公司', icon: 'user' },
          {
            id: '1-1-4',
            label: '三级公司名称',
            icon: 'folder',
            children: [
              { id: '1-1-4-1', label: '四级公司名称', icon: 'user' },
              { id: '1-1-4-2', label: '四级公司名称四级公司名...', icon: 'user' }
            ]
          }
        ]
      },
      { id: '1-2', label: '中煤西北能源化工集团有限公司', icon: 'folder' },
      { id: '1-3', label: '中煤集团山西有限公司', icon: 'folder' },
      { id: '1-4', label: '中煤资源发展集团有限公司', icon: 'folder' },
      { id: '1-5', label: '中煤集团新疆能源有限公司', icon: 'folder' },
      { id: '1-6', label: '中煤山西华昱能源有限公司', icon: 'folder' },
      { id: '1-7', label: '中煤能源黑龙江煤化工有限公司', icon: 'folder' }
    ]
  }
];

/** 用户表格数据 */
const tableData: UserRow[] = [
  {
    id: 1,
    username: 'admin',
    name: '超级管理员',
    department: '中国中煤能源集团有限...',
    phone: '18888881818',
    gender: '女',
    position: '普通员工',
    status: '正常'
  },
  {
    id: 2,
    username: '王树彪',
    name: '管理员',
    department: '平朔集团领导',
    phone: '18888881818',
    gender: '女',
    position: '领导',
    status: '正常'
  },
  {
    id: 3,
    username: '周建楠',
    name: '管理员',
    department: '部门名称',
    phone: '18888881818',
    gender: '男',
    position: '员工',
    status: '正常'
  },
  {
    id: 4,
    username: '张三',
    name: '业务员',
    department: '中煤新焦能源股份有...',
    phone: '13800138000',
    gender: '男',
    position: '专员',
    status: '停用'
  },
  {
    id: 5,
    username: '李四',
    name: '主管',
    department: '中煤华晋集团有限...',
    phone: '13912345678',
    gender: '女',
    position: '部门主管',
    status: '正常'
  }
];

/** 已选中的行 */
const selectedRows = ref<UserRow[]>([]);

/** 树节点默认展开的节点 */
const defaultExpandedKeys = ['1', '1-1'];

/** 树节点默认高亮的节点 */
const currentNodeKey = ref('1-1-3');

/**
 * 获取树节点图标
 *
 * @param data - 节点数据
 * @returns 图标组件
 */
const getTreeNodeIcon = (data: { icon: string }) => {
  switch (data.icon) {
    case 'company':
      return OfficeBuilding;
    case 'folder':
      return Folder;
    case 'user':
      return User;
    default:
      return Folder;
  }
};

/**
 * 组织机构树节点点击
 *
 * @param data - 节点数据
 */
const handleTreeNodeClick = (data: { id: string; label: string }): void => {
  selectedOrgNode.value = data.label;
  ElMessage.info(`选中组织：${data.label}`);
};

/**
 * 重置搜索表单
 */
const resetSearchForm = (): void => {
  searchFormRef.value?.resetFields();
};

/**
 * 表格选中变化
 *
 * @param selection - 选中的行数组
 */
const handleSelectionChange = (selection: UserRow[]): void => {
  selectedRows.value = selection;
};

/**
 * 打开新建对话框
 */
const openAddDialog = (): void => {
  dialogType.value = 'add';
  dialogVisible.value = true;
};

/**
 * 打开编辑对话框
 *
 * @param row - 行数据
 */
const openEditDialog = (row: UserRow): void => {
  dialogType.value = 'edit';
  Object.assign(dialogFormData, {
    username: row.username,
    name: row.name,
    department: row.department,
    phone: row.phone,
    gender: row.gender,
    position: row.position,
    status: row.status
  });
  dialogVisible.value = true;
};

/**
 * 删除单条记录
 *
 * @param row - 要删除的行数据
 */
const deleteRow = (row: UserRow): void => {
  ElMessageBox.confirm(`确定要删除用户 "${row.name}" 吗？`, '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      const index = tableData.findIndex((item) => item.id === row.id);
      if (index > -1) tableData.splice(index, 1);
      ElMessage({ message: '删除成功', type: 'success' });
    })
    .catch(() => {});
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
        const index = tableData.findIndex((item) => item.id === row.id);
        if (index > -1) tableData.splice(index, 1);
      });
      selectedRows.value = [];
      ElMessage({ message: '删除成功', type: 'success' });
    })
    .catch(() => {});
};

/**
 * 导出数据
 */
const handleExport = (): void => {
  ElMessage.success('导出功能开发中...');
};

/**
 * 提交表单
 */
const submitForm = (): void => {
  dialogFormRef.value?.validate((valid) => {
    if (valid) {
      submitLoading.value = true;
      setTimeout(() => {
        submitLoading.value = false;
        dialogVisible.value = false;
        ElMessage({
          message: dialogType.value === 'add' ? '新增成功' : '编辑成功',
          type: 'success'
        });
      }, 1000);
    }
  });
};

/**
 * 对话框关闭时重置表单
 */
const handleDialogClose = (): void => {
  dialogFormRef.value?.resetFields();
};

/**
 * 根据状态返回样式类名
 *
 * @param status - 状态
 * @returns 样式类名
 */
const getStatusClass = (status: string): string => {
  return status === '正常' ? 'status-normal' : 'status-disabled';
};
</script>

<template>
  <div class="user-management">
    <!-- 左侧组织机构树 -->
    <div class="org-tree-panel">
      <div class="panel-header">
        <span class="panel-title">组织机构</span>
      </div>
      <div class="tree-content">
        <el-tree
          :data="orgTreeData"
          :props="{ label: 'label', children: 'children' }"
          node-key="id"
          :default-expanded-keys="defaultExpandedKeys"
          :current-node-key="currentNodeKey"
          highlight-current
          @node-click="handleTreeNodeClick"
        >
          <template #default="{ data }">
            <div class="tree-node">
              <el-icon class="node-icon" :class="`icon-${data.icon}`">
                <component :is="getTreeNodeIcon(data)" />
              </el-icon>
              <span class="node-label" :title="data.label">{{ data.label }}</span>
            </div>
          </template>
        </el-tree>
      </div>
    </div>

    <!-- 右侧用户管理区域 -->
    <div class="user-panel">
      <!-- 搜索区域 -->
      <div class="search-area">
        <div class="search-form">
          <div class="search-item">
            <span class="search-label">用户名/姓名:</span>
            <el-input
              v-model="searchForm.keyword"
              placeholder="请输入姓名"
              clearable
              class="search-input"
            />
          </div>
          <div class="search-item">
            <span class="search-label">状态:</span>
            <el-select
              v-model="searchForm.status"
              placeholder="请选择筛选项"
              clearable
              class="search-input"
            >
              <el-option label="正常" value="正常" />
              <el-option label="停用" value="停用" />
            </el-select>
          </div>
          <div class="search-buttons">
            <el-button type="primary" :icon="Search">查询</el-button>
            <el-button :icon="RefreshRight" @click="resetSearchForm">重置</el-button>
          </div>
        </div>
      </div>

      <!-- 操作按钮区域 -->
      <div class="toolbar-area">
        <div class="toolbar-left">
          <el-button type="primary" :icon="Plus" @click="openAddDialog">新增</el-button>
          <el-button :icon="EditPen">编辑</el-button>
          <el-button :icon="Download" @click="handleExport">导出</el-button>
          <el-button type="danger" :icon="Delete" @click="deleteSelected">删除</el-button>
        </div>
        <div class="toolbar-right">
          <el-button :icon="Setting" circle />
        </div>
      </div>

      <!-- 表格区域 -->
      <div class="table-area">
        <el-table
          :data="tableData"
          style="width: 100%"
          @selection-change="handleSelectionChange"
          class="user-table"
        >
          <el-table-column type="selection" width="50" align="center" />
          <el-table-column type="index" label="序号" width="60" align="center" />
          <el-table-column prop="username" label="用户名" min-width="100" />
          <el-table-column prop="name" label="姓名" min-width="80" />
          <el-table-column
            prop="department"
            label="部门名称"
            min-width="180"
            show-overflow-tooltip
          />
          <el-table-column prop="phone" label="手机" min-width="120" />
          <el-table-column prop="gender" label="性别" width="60" align="center" />
          <el-table-column prop="position" label="岗位" min-width="100" />
          <el-table-column prop="status" label="状态" width="80" align="center">
            <template #default="scope">
              <span class="status-tag" :class="getStatusClass(scope.row.status)">
                {{ scope.row.status }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" align="center" fixed="right">
            <template #default="scope">
              <div class="action-buttons">
                <el-button link type="primary" size="small" @click="openEditDialog(scope.row)">
                  编辑
                </el-button>
                <el-button link type="danger" size="small" @click="deleteRow(scope.row)">
                  删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 分页区域 -->
      <div class="pagination-area">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[10, 20, 30, 50]"
          :total="tableData.length"
        />
      </div>
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增用户' : '编辑用户'"
      width="500px"
      @close="handleDialogClose"
    >
      <el-form
        ref="dialogFormRef"
        :model="dialogFormData"
        label-width="80px"
        label-position="right"
      >
        <el-form-item label="用户名" prop="username">
          <el-input v-model="dialogFormData.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="dialogFormData.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="部门" prop="department">
          <el-input v-model="dialogFormData.department" placeholder="请输入部门" />
        </el-form-item>
        <el-form-item label="手机" prop="phone">
          <el-input v-model="dialogFormData.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="性别" prop="gender">
          <el-radio-group v-model="dialogFormData.gender">
            <el-radio value="男">男</el-radio>
            <el-radio value="女">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="岗位" prop="position">
          <el-input v-model="dialogFormData.position" placeholder="请输入岗位" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="dialogFormData.status">
            <el-radio value="正常">正常</el-radio>
            <el-radio value="停用">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="submitForm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 整体布局 */
.user-management {
  display: flex;
  height: 100%;
  gap: 16px;
  padding: 16px;
  background: #f5f5f5;
  overflow: hidden;
}

/* 左侧组织机构树 */
.org-tree-panel {
  width: 288px;
  min-width: 288px;
  background: #ffffff;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid #f3f4f6;
  background: #fafafa;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.tree-content :deep(.el-tree) {
  background: transparent;
}

.tree-content :deep(.el-tree-node__content) {
  height: auto;
  min-height: 32px;
  padding: 4px 0;
  border-radius: 4px;
}

.tree-content :deep(.el-tree-node__content:hover) {
  background: #f3f4f6;
}

.tree-content :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: #eff6ff;
  color: #2563eb;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.node-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.icon-company {
  color: #3b82f6;
}

.icon-folder {
  color: #f59e0b;
}

.icon-user {
  color: #6b7280;
}

.node-label {
  font-size: 14px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 右侧用户管理区域 */
.user-panel {
  flex: 1;
  background: #ffffff;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* 搜索区域 */
.search-area {
  padding: 16px;
  border-bottom: 1px solid #f3f4f6;
  background: #ffffff;
}

.search-form {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.search-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
}

.search-input {
  width: 200px;
}

.search-buttons {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* 操作按钮区域 */
.toolbar-area {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fafafa;
  border-bottom: 1px solid #f3f4f6;
}

.toolbar-left {
  display: flex;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

/* 表格区域 */
.table-area {
  flex: 1;
  overflow: auto;
}

.user-table {
  width: 100%;
}

.user-table :deep(.el-table__header th) {
  background: #f9fafb;
  color: #374151;
  font-weight: 600;
  font-size: 14px;
}

.user-table :deep(.el-table__body td) {
  font-size: 14px;
  color: #4b5563;
}

.user-table :deep(.el-table__body tr:hover > td) {
  background: #eff6ff !important;
}

/* 状态标签 */
.status-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-normal {
  background: #dcfce7;
  color: #16a34a;
}

.status-disabled {
  background: #fee2e2;
  color: #dc2626;
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

/* 分页区域 */
.pagination-area {
  display: flex;
  justify-content: center;
  padding: 16px;
  border-top: 1px solid #f3f4f6;
  background: #ffffff;
}
</style>
