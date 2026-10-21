<script lang="ts" setup>
import { ref, reactive } from 'vue';
import { Check, Close } from '@element-plus/icons-vue';
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router';
import { useTagsViewStore } from '@/stores/tagsView';
const store = useTagsViewStore();

import { useKeepAliveStore } from '@/stores/keepAlive';

const keepStroe = useKeepAliveStore();

const activeName = ref('first');
const tableData: any = ref([
  {
    departure: '北京',
    destination: '上海',
    startTime: '2023-10-12',
    arrivalTime: '2023-10-13',
    transportation: '车'
  }
]);
const router = useRouter();
const active = ref(2);
const form = reactive({
  name: '张宇',
  department: '技术部',
  date: '2023-10-11',
  type: '其他',
  desc: '项目支持'
});
const rules = reactive({
  name: [{ required: true, message: '请输入', trigger: 'blur' }],
  department: [{ required: true, message: '请输入', trigger: 'blur' }],
  date: [{ required: true, message: '请输入', trigger: 'blur' }],
  type: [{ required: true, message: '请输入', trigger: 'blur' }],
  desc: [{ required: true, message: '请输入', trigger: 'blur' }]
});

const route = useRoute();
const handleBack = function () {
  store
    .delTagsView(route)
    .then(() => {})
    .catch((err) => {
      console.log(err);
    });
  router.push({ name: 'feiyong-two-one-organization-list' });
};

// 在导航离开渲染该组件的对应路由时调用
onBeforeRouteLeave((to) => {
  // 如果导航到不是列表页去向别的页面就不缓存
  if (to.name !== 'feiyong-two-one-organization-list') {
    keepStroe.setNoKeepAlive(keepStroe.secondKeepAliveRoute, 'feiyong-two-one-organization-list');
  }
  return true;
});
</script>
<template>
  <el-card>
    <el-tabs v-model="activeName" class="demo-tabs">
      <el-tab-pane label="表单信息" name="first">
        <el-form :model="form" :rules="rules" label-width="100px">
          <el-row :gutter="20">
            <el-col :span="6">
              <el-form-item label="申请人" prop="name">
                <el-select v-model="form.name" disabled />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="申请部门" prop="department">
                <el-select v-model="form.department" disabled />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="申请日期" prop="date">
                <el-select v-model="form.date" disabled />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="类型" prop="type">
                <el-select v-model="form.type" disabled />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="申请事由" prop="desc">
            <el-input v-model="form.desc" type="textarea" disabled />
          </el-form-item>
        </el-form>
        <h4>行程信息</h4>
        <el-table :data="tableData" border style="width: 100%">
          <el-table-column prop="departure" label="出发地"></el-table-column>
          <el-table-column prop="destination" label="到达地"></el-table-column>
          <el-table-column prop="startTime" label="出发时间"></el-table-column>
          <el-table-column prop="arrivalTime" label="到达时间"></el-table-column>
          <el-table-column prop="transportation" label="交通工具"></el-table-column>
          <el-table-column prop="name" label="备注"></el-table-column>
        </el-table>
        <h4>附件信息</h4>
        <div class="module-wrap file-wrap">
          <div class="file-item">
            <svg class="icon icon-fild" aria-hidden="true">
              <use xlink:href="#icon-excel"></use>
            </svg>
            <span>报销详情.xls</span>
          </div>
          <div class="file-item">
            <svg class="icon icon-fild" aria-hidden="true">
              <use xlink:href="#icon-word"></use>
            </svg>
            <span>报销详情.doc</span>
          </div>
          <div class="file-item">
            <svg class="icon icon-fild" aria-hidden="true">
              <use xlink:href="#icon-zip"></use>
            </svg>
            <span>报销详情.zip</span>
          </div>
        </div>
        <div class="options-wrap">
          <el-button type="primary" @click="handleBack">
            <template #icon>
              <svg class="icon" aria-hidden="true">
                <use xlink:href="#icon-back"></use>
              </svg>
            </template>
            返回
          </el-button>
        </div>
      </el-tab-pane>
      <el-tab-pane label="流程信息" name="second">
        <h4>审批流程</h4>
        <div class="step-wrap">
          <el-steps :active="active" finish-status="success">
            <el-step title="报销人" description="张进发" />
            <el-step title="部门负责人" description="马保国" />
            <el-step title="分管领导" description="马保国" />
            <el-step title="总会计师" description="马保国" />
            <el-step title="总经理" description="马保国" />
          </el-steps>
        </div>
        <h4>审批流程</h4>
        <p>报销人</p>
        <div class="module-wrap">
          <div class="apply-item">
            <div class="base-info">
              <span>张进发</span>
              <span>2023-11-10 12:00:00</span>
            </div>
            <el-button type="success" link>创建单据</el-button>
          </div>
        </div>
        <div class="options-wrap">
          <el-button type="primary" :icon="Check">撤回单据</el-button>
          <el-button type="primary" :icon="Close" plain @click="handleBack">返回</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-card>
  <!-- <div>
    <RouterLink to="/feiyong/two-one/organization">organization</RouterLink>
  </div> -->
</template>
<style scoped>
.module-wrap {
  padding: 20px;
  text-align: center;
  border: 1px solid var(#dcedf7);
  background-color: var(--el-color-primary-light-9);
}
.options-wrap {
  display: flex;
  justify-content: center;
  padding: 30px;
}
.step-wrap {
  padding: 0 50px;
}
.apply-item {
  width: 100%;
  padding: 0 30px;
  text-align: left;
}
.apply-item .base-info {
  margin-bottom: 8px;
}
.examine-detail-wrap {
  padding: 20px;
  border: 1px solid var(--el-color-primary);
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.examine-detail-wrap .examine-detail-info {
  display: flex;
}
.examine-detail-info p {
  margin: 0px;
}
.examine-detail-info .examine-name {
  margin-right: 20px;
}
.examine-detail-wrap .color-style {
  color: var(--el-color-primary);
}
.add-wrap {
  padding: 10px;
  border: 1px solid var(#e9f7ff);
  border-top: none;
  display: flex;
  justify-content: center;
}
.add-wrap .add-btn {
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  cursor: pointer;
}
.file-wrap {
  display: flex;
}
.file-item {
  width: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.file-item span {
  font-size: 14px;
  margin-top: 5px;
}
.icon-fild {
  font-size: 34px;
  color: var(--el-color-primary);
}
</style>
