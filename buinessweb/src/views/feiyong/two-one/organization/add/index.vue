<script lang="ts" setup>
import { ref, reactive } from 'vue';
import { Check, Close, DocumentAdd, Delete } from '@element-plus/icons-vue';
import type { FormInstance } from 'element-plus';
import { ElMessage } from 'element-plus';
import { useRouter, useRoute } from 'vue-router';
import { useTagsViewStore } from '@/stores/tagsView';

const store = useTagsViewStore();
const route = useRoute();

const ruleFormRef = ref<FormInstance>();
const activeName = ref('first');
const fileList = ref([]);
const tableData: any = ref([]);
const active = ref(2);
const router = useRouter();
const options = [
  {
    value: 'Option1',
    label: '技术部'
  }
];
const options2 = [
  {
    value: 'Option1',
    label: '一般报销'
  }
];
const form = reactive({
  name: '',
  department: '',
  date: '',
  type: '',
  desc: ''
});
const rules = reactive({
  name: [{ required: true, message: '请输入', trigger: 'blur' }],
  department: [{ required: true, message: '请选择部门', trigger: 'blur' }],
  date: [{ required: true, message: '请选择日期', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'blur' }],
  desc: [{ required: true, message: '请输入', trigger: 'blur' }]
});
const addOption = () => {
  tableData.value.push({ name: '' });
};
const submit = async () => {
  if (!ruleFormRef.value) return;
  ruleFormRef?.value.validate((valid, fields) => {
    if (valid) {
      ElMessage({
        message: '提交成功',
        type: 'success'
      });
      setTimeout(() => {
        router.go(-1);
      }, 2000);
    } else {
      console.log('error submit!', fields);
    }
  });
};
const deleteRow = () => {};

const handleBack = function () {
  store
    .delTagsView(route)
    .then(() => {})
    .catch((err) => {
      console.log(err);
    });
  router.push({ name: 'feiyong-two-one-organization-list' });
};
</script>
<template>
  <el-card>
    <el-tabs v-model="activeName" class="demo-tabs">
      <el-tab-pane label="表单信息" name="first">
        <el-form ref="ruleFormRef" :model="form" :rules="rules" label-width="100px">
          <el-row :gutter="20">
            <el-col :span="6">
              <el-form-item label="申请人" prop="name">
                <el-input v-model="form.name" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="申请部门" prop="department">
                <el-select v-model="form.department">
                  <el-option
                    v-for="item in options"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="申请日期" prop="date">
                <el-date-picker v-model="form.date" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="类型" prop="type">
                <el-select v-model="form.type">
                  <el-option
                    v-for="item in options2"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="申请事由" prop="desc">
            <el-input v-model="form.desc" type="textarea" />
          </el-form-item>
        </el-form>
        <h4>行程信息</h4>
        <el-table :data="tableData" border style="width: 100%">
          <el-table-column prop="name" label="出发地">
            <template #default>
              <el-input />
            </template>
          </el-table-column>
          <el-table-column prop="name" label="到达地">
            <template #default>
              <el-input />
            </template>
          </el-table-column>
          <el-table-column prop="name" label="出发时间">
            <template #default>
              <el-input />
            </template>
          </el-table-column>
          <el-table-column prop="name" label="到达时间">
            <template #default>
              <el-input />
            </template>
          </el-table-column>
          <el-table-column prop="name" label="交通工具">
            <template #default>
              <el-input />
            </template>
          </el-table-column>
          <el-table-column prop="name" label="操作">
            <template #default>
              <el-button link type="danger" :icon="Delete" @click.prevent="deleteRow()">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="add-wrap">
          <span class="add-btn" @click="addOption">
            <el-icon><CirclePlus /></el-icon>
            添加
          </span>
        </div>
        <h4>附件信息</h4>
        <div class="module-wrap">
          <el-upload
            v-model:file-list="fileList"
            class="upload-demo"
            action="https://run.mocky.io/v3/9d059bf9-4660-45f2-925d-ce80ad6c4d15"
            multiple
          >
            <el-button type="primary" :icon="DocumentAdd">点击上传</el-button>
            <template #tip>
              <div class="el-upload__tip">只能上传不超过 200M的文件.</div>
            </template>
          </el-upload>
        </div>
        <div class="options-wrap">
          <el-button type="primary" :icon="Check" @click="submit">提交</el-button>
          <el-button type="primary" :icon="Close" @click="handleBack" plain>取消</el-button>
        </div>
      </el-tab-pane>
      <el-tab-pane label="流程信息" name="second" disabled>
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
          <el-button type="primary" :icon="Close" plain>返回</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-card>
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
</style>
