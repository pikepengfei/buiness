<script lang="ts" setup>
import { ref, onMounted, onActivated } from 'vue';
import SvgIcon from './svg-icon.vue';
import EChart from './components/echarts/echarts.vue';
import { useRouter } from 'vue-router';
import {
  option,
  option2,
  option5,
  option6,
  option7,
  optiond4
} from './components/echarts/chartConfigs';
import type { TableRow } from '@/types/global';

defineOptions({
  name: 'home'
});

const $router = useRouter();
const radio = ref('待我审批');

const tableData: TableRow[] = [
  { code: 'YWCLX02162023110083', type: '一般差旅', date: '2023-10-12', amount: 122, apply: '展示' },
  { code: 'YWCLX02162023110084', type: '一般差旅', date: '2023-10-12', amount: 122, apply: '展示' },
  { code: 'YWCLX02162023110086', type: '一般差旅', date: '2023-10-12', amount: 122, apply: '展示' },
  { code: 'YWCLX02162023110067', type: '一般差旅', date: '2023-10-12', amount: 122, apply: '展示' },
  { code: 'YWCLX02162023110089', type: '一般差旅', date: '2023-10-12', amount: 122, apply: '展示' },
  { code: 'YWCLX02162023110089', type: '一般差旅', date: '2023-10-12', amount: 122, apply: '展示' },
  { code: 'YWCLX02162023110089', type: '一般差旅', date: '2023-10-12', amount: 122, apply: '展示' }
];

const handleGoDetail = (): void => {
  $router.push({
    name: 'feiyong-two-one-organization-detail',
    params: {
      id: 'CLFG4121231233123121'
    }
  });
};

onMounted(() => {
  console.log('wo shi home onMounted...');
});
onActivated(() => {
  console.log('wo shi home onActivated');
});
</script>
<template>
  <div class="home-wrap">
    <el-row :gutter="20" class="margin-b-20">
      <el-col :span="7">
        <el-card>
          <template #header>
            <div class="card-head">
              <svg-icon class="head-icon">
                <svg class="icon icon-title" aria-hidden="true">
                  <use xlink:href="#icon-kjdl"></use>
                </svg>
              </svg-icon>
              快捷功能
            </div>
          </template>
          <div class="sys-wrap margin-t-10 margin-b-30">
            <dl class="sys-item">
              <dt class="sys-icon sys-icon-one">
                <svg class="icon icon-title" aria-hidden="true">
                  <use xlink:href="#icon-fysq"></use>
                </svg>
              </dt>
              <dd class="syc-name">费用申请</dd>
            </dl>
            <dl class="sys-item">
              <dt class="sys-icon sys-icon-two">
                <svg class="icon icon-title" aria-hidden="true">
                  <use xlink:href="#icon-xmry"></use>
                </svg>
              </dt>
              <dd class="syc-name">项目人员</dd>
            </dl>
            <dl class="sys-item">
              <dt class="sys-icon sys-icon-three">
                <svg class="icon icon-title" aria-hidden="true">
                  <use xlink:href="#icon-xmlx"></use>
                </svg>
              </dt>
              <dd class="syc-name">项目立项</dd>
            </dl>
            <dl class="sys-item">
              <dt class="sys-icon sys-icon-four">
                <svg class="icon icon-title" aria-hidden="true">
                  <use xlink:href="#icon-xmjh"></use>
                </svg>
              </dt>
              <dd class="syc-name">项目计划</dd>
            </dl>
          </div>
          <div class="sys-wrap margin-b-10">
            <dl class="sys-item">
              <dt class="sys-icon sys-icon-five">
                <svg class="icon icon-title" aria-hidden="true">
                  <use xlink:href="#icon-fybx"></use>
                </svg>
              </dt>
              <dd class="syc-name">费用报销</dd>
            </dl>
            <dl class="sys-item">
              <dt class="sys-icon sys-icon-five">
                <svg class="icon icon-title" aria-hidden="true">
                  <use xlink:href="#icon-gdsq"></use>
                </svg>
              </dt>
              <dd class="syc-name">工单申请</dd>
            </dl>
            <dl class="sys-item">
              <dt class="sys-icon sys-icon-five">
                <svg class="icon icon-title" aria-hidden="true">
                  <use xlink:href="#icon-yingxiao"></use>
                </svg>
              </dt>
              <dd class="syc-name">费用报表</dd>
            </dl>
            <dl class="sys-item">
              <dt class="sys-icon sys-icon-five">
                <svg class="icon icon-title" aria-hidden="true">
                  <use xlink:href="#icon-cwgl"></use>
                </svg>
              </dt>
              <dd class="syc-name">财务管理</dd>
            </dl>
          </div>
        </el-card>
      </el-col>
      <el-col :span="17">
        <el-card>
          <template #header>
            <div class="card-head">
              <svg-icon class="head-icon">
                <svg class="icon icon-title" aria-hidden="true">
                  <use xlink:href="#icon-wddb"></use>
                </svg>
              </svg-icon>
              我的事项
            </div>
          </template>
          <el-row :gutter="10" class="block-wrap">
            <el-col :span="6">
              <div class="data-block block-one">
                <h4>待处理工单</h4>
                <span class="data-num">50</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="data-block block-two">
                <h4>待报销明细</h4>
                <span class="data-num">50</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="data-block block-three">
                <h4>待提交汇报</h4>
                <span class="data-num">50</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="data-block block-four">
                <h4>待提交报表</h4>
                <span class="data-num">50</span>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="20" class="margin-b-20">
      <el-col :span="7">
        <el-card class="margin-b-20">
          <template #header>
            <div class="head-wrap">
              <div class="card-head">
                <svg-icon class="head-icon">
                  <svg class="icon icon-title" aria-hidden="true">
                    <use xlink:href="#icon-ndjymb"></use>
                  </svg>
                </svg-icon>
                年度经营目标
              </div>
              <p class="gold-color">
                <span>900</span>
                万
              </p>
            </div>
          </template>
          <div class="charts-wrap">
            <div style="height: 150px; width: 150px">
              <e-chart :option="option" />
            </div>
            <p class="chart-num">
              目标已完成
              <span>360</span>
              万
            </p>
          </div>
        </el-card>
        <el-card>
          <template #header>
            <div class="head-wrap">
              <div class="card-head">
                <svg-icon class="head-icon">
                  <svg class="icon icon-title" aria-hidden="true">
                    <use xlink:href="#icon-ndhkmb"></use>
                  </svg>
                </svg-icon>
                年度回款目标
              </div>
              <p class="gold-color">
                <span>900</span>
                万
              </p>
            </div>
          </template>
          <div class="charts-wrap">
            <div style="height: 150px; width: 150px">
              <e-chart :option="option2" />
            </div>
            <p class="chart-num">
              目标已完成
              <span>360</span>
              万
            </p>
          </div>
        </el-card>
      </el-col>
      <el-col :span="17">
        <el-card>
          <template #header>
            <div class="head-wrap">
              <div class="card-head">
                <svg-icon class="head-icon">
                  <svg class="icon icon-title" aria-hidden="true">
                    <use xlink:href="#icon-qwcl"></use>
                  </svg>
                </svg-icon>
                我的待办
              </div>
              <el-radio-group v-model="radio">
                <el-radio-button value="待我审批" label="待我审批" />
                <el-radio-button value="超期待审" label="超期待审" />
                <el-radio-button value="我的提交" label="我的提交" />
                <el-radio-button value="被退回的" label="被退回的" />
              </el-radio-group>
            </div>
          </template>
          <el-table height="422" :data="tableData">
            <el-table-column type="index" label="序号" width="60" />
            <el-table-column prop="code" label="审批单号" width="200" />
            <el-table-column prop="type" label="报销类型" width="180" />
            <el-table-column prop="date" label="提交时间" />
            <el-table-column prop="amount" label="报销金额" />
            <el-table-column prop="apply" label="审批对象" />
            <el-table-column prop="address" label="操作">
              <template #default>
                <el-button link type="primary" @click="handleGoDetail">
                  <template #icon>
                    <el-icon class="arrow-icon" size="12px" color="#fff">
                      <ArrowRightBold />
                    </el-icon>
                  </template>
                  查看详情
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="20" class="margin-b-20">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="head-wrap">
              <div class="card-head">
                <svg-icon class="head-icon">
                  <svg class="icon icon-title" aria-hidden="true">
                    <use xlink:href="#icon-mtsc"></use>
                  </svg>
                </svg-icon>
                煤炭生产
              </div>
            </div>
          </template>
          <div style="height: 300px">
            <e-chart :option="option6" />
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="head-wrap">
              <div class="card-head">
                <svg-icon class="head-icon">
                  <svg class="icon icon-title" aria-hidden="true">
                    <use xlink:href="#icon-szyc"></use>
                  </svg>
                </svg-icon>
                收支预测
              </div>
            </div>
          </template>
          <div style="height: 300px">
            <e-chart :option="option5" />
          </div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="head-wrap">
              <div class="card-head">
                <svg-icon class="head-icon">
                  <svg class="icon icon-title" aria-hidden="true">
                    <use xlink:href="#icon-srjg"></use>
                  </svg>
                </svg-icon>
                收入结构
              </div>
            </div>
          </template>
          <div style="height: 300px">
            <e-chart :option="option7" />
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="head-wrap">
              <div class="card-head">
                <svg-icon class="head-icon">
                  <svg class="icon icon-title" aria-hidden="true">
                    <use xlink:href="#icon-zhye"></use>
                  </svg>
                </svg-icon>
                账户余额
              </div>
              <p class="gold-color">
                <span>900</span>
                万
              </p>
            </div>
          </template>
          <div style="height: 300px">
            <e-chart :option="optiond4" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
<style scoped>
.margin-b-20 {
  margin-bottom: 20px;
}
:deep().el-card__header {
  border-bottom: none;
  padding-bottom: 0;
}
.block-wrap {
  display: flex;
}
.data-block {
  height: 111px;
  border-radius: 10px;
  background-size: 100% 100%;
}
.data-block .data-num {
  color: #fff;
  font-size: 40px;
  font-weight: 600;
  margin-left: 60px;
}
.data-block h4 {
  color: #fff;
  margin: 0;
  height: 50px;
  line-height: 50px;
  padding-left: 40px;
}
.block-one {
  background-image: url('@/assets/img/box_01.png');
}
.block-two {
  background-image: url('@/assets/img/box_02.png');
}
.block-three {
  background-image: url('@/assets/img/box_03.png');
}
.block-four {
  background-image: url('@/assets/img/box_04.png');
}
.head-wrap {
  display: flex;
  justify-content: space-between;
  height: 42px;
}
.card-head {
  display: flex;
  align-items: center;
  height: 40px;
}
.card-head .head-icon {
  margin-right: 10px;
}
/* 预警信息 */
.message-wrap {
  padding: 0;
}
.message-wrap li {
  border-bottom: 1px solid var(#dcedf7);
  display: flex;
  justify-content: space-between;
  padding-bottom: 5px;
}
.message-wrap .index {
  margin-right: 20px;
}
.message-wrap .content {
  margin: 0;
}
.charts-wrap {
  display: flex;
  align-items: center;
}
.gold-color {
  margin: 0;
}
.gold-color span {
  color: var(--el-color-primary);
  font-size: 32px;
}
.chart-num {
  margin: 0 0 0 20px;
}
.chart-num span {
  color: #ff932b;
  font-size: 32px;
}
.sys-wrap {
  display: flex;
  justify-content: space-between;
}
.sys-item {
  display: flex;
  align-items: center;
  margin: 0;
  cursor: pointer;
}
.sys-item .sys-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #999;
  display: flex;
  justify-content: center;
  align-items: center;
}
.sys-item .sys-icon-one {
  background: #4ea4e6;
}
.sys-item .sys-icon-two {
  background: #89da83;
}
.sys-item .sys-icon-three {
  background: #7f80da;
}
.sys-item .sys-icon-four {
  background: #c57ddf;
}
.sys-item .sys-icon-five {
  background: #0074ce;
}
.sys-item .syc-name {
  margin-left: 5px;
  font-size: 14px;
}
.margin-t-10 {
  margin-top: 10px;
}
.margin-b-30 {
  margin-bottom: 30px;
}
.margin-b-10 {
  margin-bottom: 10px;
}
.arrow-icon {
  background-color: var(--el-color-primary);
  border-radius: 50%;
  height: 14px;
  width: 14px;
}
.icon-title {
  color: #fff;
}
</style>
