<script lang="ts" setup>
import { reactive, ref, computed, onMounted, onActivated } from 'vue';
import { Plus, EditPen, Delete, RefreshLeft, Search } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';

// 声明二级路由name名字  缓存用
defineOptions({
  name: 'huoyuan-two-one-lixiang-list3'
});
onMounted(() => {
  console.log('onMounted ...wo shi huoyuan-two-one-lixiang');
});

onActivated(() => {
  console.log('onActivated ...wo shi huoyuan-two-one-lixiang');
});

const showForm = ref(true);
const dialogVisible = ref(false);
const submitLoading = ref(false);
const formRef = ref<FormInstance>();
const sizeForm = reactive({
  name: '',
  department: ''
});
const showText = computed(() => {
  return showForm.value ? '收起搜索条件' : '展开搜索条件';
});
const formLabelAlign = reactive({
  name: '',
  code: '',
  date: '',
  type: '',
  head: '',
  people: '',
  amount: '',
  customeName: '',
  stage: ''
});
const rules = reactive<FormRules>({
  name: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入项目编号', trigger: 'blur' }],
  head: [{ required: true, message: '请输入负责人', trigger: 'blur' }],
  people: [{ required: true, message: '请输入立项人', trigger: 'blur' }]
});
const tableData = [
  {
    productName: '测试项目',
    code: 'XM20231020123',
    name: '张三',
    department: '技术部',
    date: '2023-10-12',
    type: '软件',
    stage: '阶段',
    customeName: '客户名称',
    head: '李四',
    people: '王五',
    amount: 220
  }
];
for (let i = 0; i < 10; i++) {
  tableData.push({
    productName: '测试项目',
    code: 'XM20231010345',
    name: '张三',
    department: '技术部',
    date: '2023-10-12',
    type: '软件',
    stage: '阶段',
    customeName: '客户名称',
    head: '李四',
    people: '王五',
    amount: 220
  });
}
const optForm = () => {
  showForm.value = !showForm.value;
};
/**
 * 提交表单
 */
const submit = () => {
  submitLoading.value = true;
  setTimeout(() => {
    submitLoading.value = false;
    dialogVisible.value = false;
  }, 1000);
};
/**
 * 清除查询条件
 */
const resetForm = (formEl: FormInstance | undefined) => {
  if (!formEl) return;
  formEl.resetFields();
};
const deleteRow = () => {};
</script>
<template>
  <el-card class="table-main">
    <div class="option-wrap">
      <span class="option-btn" @click="optForm">
        通用列表 list 3333
        <el-icon>
          <component :is="showForm ? 'ArrowDown' : 'ArrowUp'"></component>
        </el-icon>
      </span>
      <span class="option-text">{{ showText }}</span>
    </div>
    <div class="form-wrap" v-show="showForm">
      <el-form
        ref="formRef"
        :inline="true"
        :model="sizeForm"
        label-position="top"
        label-width="auto"
      >
        <el-row :gutter="20">
          <el-col :span="6">
            <el-form-item label="项目名称" prop="name">
              <el-input v-model="sizeForm.name" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="项目编号" prop="name">
              <el-input v-model="sizeForm.name" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="项目类型" prop="department">
              <el-select v-model="sizeForm.department" />
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
    </div>
    <div v-show="showForm" class="segment-line"></div>
    <div class="table-options">
      <el-button :icon="Plus" type="primary" @click="dialogVisible = true">新建项目</el-button>
    </div>
    <el-table :data="tableData" style="width: 100%">
      <el-table-column fixed="left" type="selection" width="55" />
      <el-table-column fixed="left" type="index" label="编号" width="55" />
      <el-table-column fixed="left" prop="productName" label="项目名称" />
      <el-table-column prop="code" label="项目编号" width="200">
        <template #default="scope">
          <el-link type="primary">{{ scope.row.code }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="type" label="项目类型" />
      <el-table-column prop="stage" label="项目阶段" />
      <el-table-column prop="customeName" label="客户名称" />
      <el-table-column prop="head" label="负责人" />
      <el-table-column prop="people" label="立项人" />
      <el-table-column prop="date" width="120" label="立项时间" />
      <el-table-column prop="amount" label="费用金额" />
      <el-table-column fixed="right" label="操作" width="180">
        <template #default>
          <el-button link type="primary" :icon="EditPen" @click.prevent="deleteRow()">
            编辑
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
  <el-dialog v-model="dialogVisible" title="新建项目" width="30%">
    <el-form ref="ruleFormRef" label-width="100px" :model="formLabelAlign" :rules="rules">
      <el-form-item label="项目名称" prop="name">
        <el-input v-model="formLabelAlign.name" />
      </el-form-item>
      <el-form-item label="项目编号" prop="code">
        <el-input v-model="formLabelAlign.code" />
      </el-form-item>
      <el-form-item label="负责人" prop="head">
        <el-input v-model="formLabelAlign.head" />
      </el-form-item>
      <el-form-item label="立项人" prop="name">
        <el-input v-model="formLabelAlign.people" />
      </el-form-item>
      <el-form-item label="立项时间" prop="date">
        <el-date-picker v-model="formLabelAlign.date" type="date" placeholder="选择日期" />
      </el-form-item>
      <el-form-item label="项目类型" prop="type">
        <el-select v-model="formLabelAlign.type" />
      </el-form-item>
      <el-form-item label="项目阶段" prop="stage">
        <el-select v-model="formLabelAlign.stage" />
      </el-form-item>
      <el-form-item label="客户名称" prop="customeName">
        <el-input v-model="formLabelAlign.customeName" />
      </el-form-item>
      <el-form-item label="费用金额" prop="amount">
        <el-input v-model="formLabelAlign.amount" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitLoading" @click="submit">提交</el-button>
    </template>
  </el-dialog>
</template>
<style scoped>
.option-wrap {
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-bottom: 10px;
  font-size: 14px;
}
.form-wrap {
  padding-bottom: 15px;
}
.option-wrap .option-btn {
  display: flex;
  align-items: center;
  margin-right: 10px;
}
.option-wrap .option-text {
  color: var(--el-color-primary);
}
.table-options {
  padding: 15px 0;
}
.pagination-wrap {
  padding: 15px 0;
  display: flex;
  justify-content: center;
}
.segment-line {
  height: 1px;
  background-color: var(--el-color-primary-light-9);
}
.table-main {
  display: flex;
  flex-direction: column;
}
:deep().el-select {
  width: 100%;
}
.btn-position {
  display: flex;
  align-items: end;
}
</style>
