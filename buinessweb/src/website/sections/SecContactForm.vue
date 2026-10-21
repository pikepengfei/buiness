<script setup lang="ts">
// 联系方式 + 售后申请表单区块（结构固定，文案/联系方式/问题类型可编辑）
import { reactive, ref } from 'vue';
import { formApi } from '@/api/cms';
import type { ContactPayload } from '@/types/cms';

const props = defineProps<{ p: Record<string, any>; preview?: boolean }>();

const form = reactive({ name: '', phone: '', email: '', model: '', type: '', message: '', agree: false });
if (props.p.typeOptions?.length) form.type = props.p.typeOptions[0];

const submitting = ref(false);
const tip = ref('');

async function onSubmit() {
  if (props.preview) return; // 编辑器预览中不真实提交
  if (!form.name.trim()) { tip.value = '请填写您的称呼'; return; }
  if (!form.phone.trim()) { tip.value = '请填写联系电话'; return; }
  if (!form.agree) { tip.value = '请先阅读并同意隐私条款'; return; }
  submitting.value = true;
  try {
    const payload: ContactPayload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      type: form.type,
      message:
        (form.model.trim() ? `产品型号：${form.model.trim()}\n` : '') +
        (form.message.trim() || '（未填写问题描述）'),
    };
    await formApi.submitContact(payload);
    tip.value = '提交成功，我们会尽快与您联系！';
    form.name = ''; form.phone = ''; form.email = ''; form.model = ''; form.message = ''; form.agree = false;
  } catch (e: any) {
    tip.value = e?.message ? `提交失败：${e.message}` : '提交失败，请稍后重试';
  } finally {
    submitting.value = false;
    setTimeout(() => (tip.value = ''), 2200);
  }
}
</script>

<template>
  <section style="background: var(--paper)">
    <div class="container">
      <div class="contact-grid">
        <div class="contact-info">
          <h3>{{ p.infoTitle }}</h3>
          <ul class="contact-list">
            <li v-for="(it, i) in p.infoItems || []" :key="i">
              <div class="ico">{{ it.icon }}</div>
              <div>
                <div class="label">{{ it.label }}</div>
                <div class="val">
                  <template v-for="(l, j) in it.lines || []" :key="j">{{ l }}<br v-if="Number(j) + 1 < Number((it.lines || []).length)" /></template>
                </div>
              </div>
            </li>
          </ul>
        </div>

        <form class="contact-form" @submit.prevent="onSubmit">
          <h3 style="margin: 0 0 8px; font-size: 22px">{{ p.formTitle }}</h3>
          <p style="margin: 0 0 28px; font-size: 14px; color: var(--ink-500)">{{ p.formDesc }}</p>

          <div class="row">
            <div>
              <label>您的称呼</label>
              <input v-model="form.name" type="text" placeholder="如：王先生" required />
            </div>
            <div>
              <label>联系电话</label>
              <input v-model="form.phone" type="tel" placeholder="如：138 0000 0000" required />
            </div>
          </div>

          <div class="row">
            <div>
              <label>电子邮箱（选填）</label>
              <input v-model="form.email" type="email" placeholder="如：you@example.com" />
            </div>
            <div>
              <label>产品型号（选填）</label>
              <input v-model="form.model" type="text" placeholder="如：小方块 CB500" />
            </div>
          </div>

          <div class="row">
            <div class="full">
              <label>问题类型</label>
              <select v-model="form.type">
                <option v-for="(opt, i) in p.typeOptions || []" :key="i">{{ opt }}</option>
              </select>
            </div>
          </div>

          <div class="row">
            <div class="full">
              <label>问题描述</label>
              <textarea v-model="form.message" placeholder="请描述故障现象、出现时间、使用环境（如设备型号、系统等）"></textarea>
            </div>
          </div>

          <label class="agree-line">
            <input v-model="form.agree" type="checkbox" />
            <span>{{ p.agreeText }}</span>
          </label>

          <button type="submit" :disabled="submitting || preview">
            {{ submitting ? '提交中…' : (p.submitText || '提交') }}
          </button>
        </form>
      </div>
    </div>
    <div class="toast" v-if="tip">{{ tip }}</div>
  </section>
</template>

<style scoped>
.agree-line {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 12.5px;
  color: var(--ink-500);
  margin: 4px 0 18px;
  font-weight: 400;
  letter-spacing: 0;
}
.agree-line input {
  margin-top: 3px;
  width: auto;
  flex: none;
}
.toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  background: var(--ink-900);
  color: #fff;
  padding: 12px 22px;
  border-radius: 999px;
  font-size: 14px;
  z-index: 60;
}
</style>
