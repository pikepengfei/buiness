<script lang="ts" setup>
import { ref, onMounted, onActivated } from 'vue';

import { useKeepAliveStore } from '@/stores/keepAlive';

import { onBeforeRouteLeave } from 'vue-router';

const keepStroe = useKeepAliveStore();

// 缓存页面要用到name
defineOptions({
  name: 'feiyong-two-two-tenant'
});

onMounted(() => {
  console.log('onMounted...feiyong-two-two-tenant...');
});

onActivated(() => {
  console.log('onActivated...feiyong-two-two-tenant...');
});

// 在导航离开渲染该组件的对应路由时调用
onBeforeRouteLeave((to, from) => {
  // 如果导航到不是organization就不缓存
  if (to.name === 'feiyong-two-one-organization-list') {
    keepStroe.setNoKeepAlive(keepStroe.secondKeepAliveRoute, from.name as string);
  }
  return true;
});

interface Tree {
  label: string;
  children?: Tree[];
}
import { EditPen, Delete, Plus, Upload } from '@element-plus/icons-vue';
const value = ref('');
const data: Tree[] = [
  {
    label: '一级选项',
    children: [
      {
        label: '二级选项',
        children: [
          {
            label: '三级选项'
          }
        ]
      }
    ]
  },
  {
    label: '一级选项',
    children: [
      {
        label: '二级选项'
      },
      {
        label: '二级选项'
      }
    ]
  }
];
const tableData = [
  {
    code: 'CLFG4121231233123123',
    name: '张三',
    department: '技术部',
    date: '2023-10-12',
    type: '其他费用',
    reason: '采购经费',
    status: '已关联',
    approvalStatus: '审批通过'
  },
  {
    code: 'CLFG4121231233123123',
    name: '张三',
    department: '技术部',
    date: '2023-10-12',
    type: '其他费用',
    reason: '采购经费',
    status: '已关联',
    approvalStatus: '审批拒绝'
  }
];
const classType = (status: string) => {
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
const handleNodeClick = () => {};
const deleteRow = () => {};
</script>
<template>
  <div class="tree-table-wrap">
    <el-card class="tree-wrap">
      <div class="button-wrap">
        <el-button type="primary" plain>部门一</el-button>
        <el-button type="primary" plain>部门二</el-button>
        <el-button type="primary" plain>部门三</el-button>
      </div>
      <el-tree :data="data" @node-click="handleNodeClick" />
    </el-card>
    <div class="table-wrap">
      <el-card class="condition-wrap">
        <el-date-picker v-model="value" type="daterange" class="date-style"></el-date-picker>
        <div class="choose-day">
          <el-button type="primary" plain>7天</el-button>
          <el-button type="primary" plain>30天</el-button>
          <el-button type="primary" plain>90天</el-button>
        </div>
      </el-card>
      <el-card class="flex-table">
        <div class="table-options">
          <el-button :icon="Plus" type="primary">新增</el-button>
          <el-button :icon="EditPen" type="primary" plain>编辑</el-button>
          <el-button :icon="Upload" type="primary" plain>导出</el-button>
        </div>
        <el-table :data="tableData">
          <el-table-column fixed="left" type="selection" width="55" />
          <el-table-column fixed="left" type="index" label="编号" width="55" />
          <el-table-column prop="name" label="申请人" />
          <el-table-column prop="department" label="申请部门" />
          <el-table-column prop="date" width="120" label="申请日期" />
          <el-table-column prop="type" label="类型" />
          <el-table-column prop="reason" label="申请事由" />
          <el-table-column prop="status" label="单据状态" />
          <el-table-column prop="approvalStatus" width="100" label="审批状态">
            <template #default="scope">
              <span class="zm-tag" :class="classType(scope.row.approvalStatus)" type="primary">
                {{ scope.row.approvalStatus }}
              </span>
            </template>
          </el-table-column>
          <el-table-column fixed="right" label="操作" width="180">
            <template #default>
              <el-button link type="primary" @click.prevent="deleteRow()">
                <template #icon>
                  <svg class="icon" aria-hidden="true">
                    <use xlink:href="#icon-back"></use>
                  </svg>
                </template>
                撤回
              </el-button>
              <el-button link type="primary" :icon="Delete" @click.prevent="deleteRow()">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination
            layout="sizes,prev, pager, next"
            :page-sizes="[10, 20, 30, 50]"
            :total="tableData.length"
          ></el-pagination>
        </div>
      </el-card>
    </div>
  </div>
</template>
<style scoped>
.tree-table-wrap {
  display: flex;
  min-height: calc(100vh - var(--zm-header-height) - var(--zm-footer-height) - 94px);
}
.tree-wrap {
  min-width: 290px;
  margin-right: 10px;
}
.tree-wrap .button-wrap {
  margin-bottom: 20px;
}
.table-wrap {
  display: flex;
  flex: 1;
  overflow: auto;
  flex-direction: column;
}
.condition-wrap {
  margin-bottom: 10px;
}
.flex-table {
  flex: 1;
}
.pagination-wrap {
  padding: 15px 0;
  display: flex;
  justify-content: center;
}
.table-options {
  padding-bottom: 15px;
}
.zm-tag {
  margin-left: 10px;
  position: relative;
}
.zm-tag::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
  display: inline-block;
  position: absolute;
  left: -10px;
  top: 8px;
}
.examineing {
  color: var(--el-color-primary);
}
.examine-faild {
  color: var(--el-color-danger);
}
.examine-faild::before {
  background-color: var(--el-color-danger);
}
.approved {
  color: var(--el-color-success);
}
.approved::before {
  background-color: var(--el-color-success);
}
.choose-day {
  display: inline-block;
  margin-left: 20px;
}
</style>
