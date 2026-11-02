<script setup lang="ts">
/**
 * 资讯正文编辑器（Tiptap 3）
 *
 * 能力边界与后端清洗白名单逐条对齐（design D9）：
 *  - 标题只到 h2/h3/h4，h1 留给页面标题；
 *  - 不装 TextAlign / TextStyle / Color / Highlight / Indent / Table —— 这些靠 style 或 class 表达，
 *    而官网渲染前 style 全剥、class 只在 img 上保留，装了也存不住（表格的 colwidth 同理）；
 *  - 图片只能从素材库取地址；粘贴或拖入的站外图片在客户端就地剥除，服务端再兜一层。
 */
import { computed, ref, watch } from 'vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { ElMessage, ElMessageBox } from 'element-plus';
import MediaPicker from '../../../website/components/MediaPicker.vue';

const props = defineProps<{ modelValue?: string; placeholder?: string; editable?: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();
// 已上线内容只读：不给工具栏、也不让 ProseMirror 接编辑事件（缺省视为可编辑）
const canEdit = computed(() => props.editable !== false);

// h1 留给页面标题，正文最高只到 h4（与后端清洗后官网渲染的层级一致）
const HEADING_LEVELS = [2, 3, 4] as const;

const editor = useEditor({
  content: props.modelValue || '',
  editable: props.editable !== false,
  editorProps: {
    attributes: { class: 'rbe-content' },
    // 粘贴内容里的 <img> 只保留站内素材，外链图与 data: 一律丢弃（剥除时给出引导，不静默吞掉）
    transformPastedHTML: (html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      let removed = 0;
      doc.querySelectorAll('img').forEach((img) => {
        if (!isInternalSrc(img.getAttribute('src') || '')) { img.remove(); removed++; }
      });
      if (removed) ElMessage.warning(`已移除粘贴内容中的 ${removed} 张站外图片，请从素材库选择后插入`);
      return doc.body.innerHTML;
    },
  },
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      // 链接一律新窗口打开并切断 opener；HTMLAttributes 即官网拿到的最终属性
      link: { openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
    }),
    Image.configure({ allowBase64: false, HTMLAttributes: { loading: 'lazy' } }),
    Placeholder.configure({ placeholder: props.placeholder || '请输入正文…' }),
  ],
  onUpdate: ({ editor: e }) => emit('update:modelValue', e.getHTML()),
});

watch(() => props.modelValue, (v) => {
  const html = v || '';
  if (editor.value && editor.value.getHTML() !== html) editor.value.commands.setContent(html, { emitUpdate: false });
});

watch(() => props.editable, (v) => {
  editor.value?.setEditable(v !== false);
});

function isInternalSrc(raw: string): boolean {
  const src = String(raw || '').trim();
  if (!src || src.startsWith('data:')) return false;
  // 相对路径只认站内素材目录与内置资产前缀，与后端 isInternalMediaSrc 同口径
  if (src.startsWith('/uploads/') || src.startsWith('/website/')) return true;
  try {
    const u = new URL(src, window.location.origin);
    return u.origin === window.location.origin
      && (u.pathname.startsWith('/uploads/') || u.pathname.startsWith('/website/'));
  } catch {
    return false;
  }
}

const pickerVisible = ref(false);
function onPicked(url: string) {
  pickerVisible.value = false;
  if (!url) return;
  editor.value?.chain().focus().setImage({ src: url }).run();
}

async function setLink() {
  const ed = editor.value;
  if (!ed) return;
  if (ed.isActive('link')) { ed.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
  const previous = ed.getAttributes('link').href as string;
  try {
    const { value } = await ElMessageBox.prompt('链接地址（官网新窗口打开）', '插入链接', {
      inputValue: previous || 'https://',
      inputPattern: /^(https?:\/\/\S+|\/[^/].*)$/,
      inputErrorMessage: '需以 http(s):// 开头，或站内路径 / 开头',
    });
    ed.chain().focus().extendMarkRange('link').setLink({ href: value, target: '_blank', rel: 'noopener noreferrer' }).run();
  } catch { /* 取消即视为不改动 */ }
}

const act = (cmd: (e: NonNullable<typeof editor.value>) => any) => {
  const ed = editor.value;
  if (ed) cmd(ed).run();
};
const active = (name: string, attrs?: Record<string, any>) => !!editor.value?.isActive(name, attrs);
const H = computed(() => HEADING_LEVELS.map((level) => ({ level, on: active('heading', { level }) })));

// 空正文判定与后端 hasVisibleText 同口径：剥掉标签与空白后没有文字即视为空（只有图也算空）
function hasVisibleText(html: string): boolean {
  return String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|\s/gi, '').length > 0;
}
const isEmpty = computed(() => !hasVisibleText(props.modelValue || ''));
defineExpose({ isEmpty, focus: () => editor.value?.chain().focus().run() });
</script>

<template>
  <div class="rbe">
    <div v-if="editor && canEdit" class="rbe-bar">
      <el-button-group>
        <el-button size="small" :type="active('bold') ? 'primary' : ''" @click="act((e) => e.chain().toggleBold())">B</el-button>
        <el-button size="small" :type="active('italic') ? 'primary' : ''" @click="act((e) => e.chain().toggleItalic())">I</el-button>
        <el-button size="small" :type="active('underline') ? 'primary' : ''" @click="act((e) => e.chain().toggleUnderline())">U</el-button>
        <el-button size="small" :type="active('strike') ? 'primary' : ''" @click="act((e) => e.chain().toggleStrike())">S</el-button>
      </el-button-group>
      <el-button-group>
        <el-button size="small" :type="!active('heading') ? 'primary' : ''" @click="act((e) => e.chain().setParagraph())">正文</el-button>
        <el-button
          v-for="h in H" :key="h.level" size="small" :type="h.on ? 'primary' : ''"
          @click="act((e) => (h.on ? e.chain().setParagraph() : e.chain().toggleHeading({ level: h.level })))"
        >H{{ h.level }}</el-button>
      </el-button-group>
      <el-button-group>
        <el-button size="small" :type="active('bulletList') ? 'primary' : ''" @click="act((e) => e.chain().toggleBulletList())">
          <el-icon><List /></el-icon>
        </el-button>
        <el-button size="small" :type="active('orderedList') ? 'primary' : ''" @click="act((e) => e.chain().toggleOrderedList())">1.</el-button>
        <el-button size="small" :type="active('blockquote') ? 'primary' : ''" @click="act((e) => e.chain().toggleBlockquote())">引用</el-button>
        <el-button size="small" :type="active('code') ? 'primary' : ''" @click="act((e) => e.chain().toggleCode())">&lt;&gt;</el-button>
        <el-button size="small" :type="active('codeBlock') ? 'primary' : ''" @click="act((e) => e.chain().toggleCodeBlock())">代码块</el-button>
      </el-button-group>
      <el-button-group>
        <el-button size="small" :type="active('link') ? 'primary' : ''" @click="setLink">
          <el-icon><Link /></el-icon>
        </el-button>
        <el-button size="small" @click="pickerVisible = true">
          <el-icon><Picture /></el-icon>
        </el-button>
        <el-button size="small" @click="act((e) => e.chain().setHorizontalRule())">
          <el-icon><Minus /></el-icon>
        </el-button>
      </el-button-group>
      <el-button-group>
        <el-button size="small" :disabled="!editor.can().undo()" @click="act((e) => e.chain().undo())">
          <el-icon><RefreshLeft /></el-icon>
        </el-button>
        <el-button size="small" :disabled="!editor.can().redo()" @click="act((e) => e.chain().redo())">
          <el-icon><RefreshRight /></el-icon>
        </el-button>
      </el-button-group>
      <span class="rbe-tip">Shift+Enter 换行 · 无对齐/字号/颜色/缩进/表格入口（官网渲染不保留）</span>
    </div>
    <EditorContent class="rbe-body" :editor="editor" />
    <div v-if="canEdit && isEmpty" class="rbe-warn">正文还没有文字，保存可以、发布会被拒绝</div>
    <MediaPicker v-model:visible="pickerVisible" @select="onPicked" />
  </div>
</template>

<style scoped>
.rbe {
  width: 100%;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
}
.rbe-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
}
.rbe-tip {
  font-size: 12px;
  color: #909399;
}
.rbe-body {
  background: #fff;
}
.rbe-warn {
  padding: 6px 10px;
  font-size: 12px;
  color: #e6a23c;
  background: #fdf6ec;
}
:deep(.rbe-content) {
  min-height: 320px;
  padding: 14px 16px;
  outline: none;
  font-size: 14px;
  line-height: 1.8;
}
:deep(.rbe-content h2) { font-size: 20px; margin: 14px 0 8px; }
:deep(.rbe-content h3) { font-size: 17px; margin: 12px 0 6px; }
:deep(.rbe-content h4) { font-size: 15px; margin: 10px 0 6px; }
:deep(.rbe-content p) { margin: 0 0 10px; }
:deep(.rbe-content img) { max-width: 100%; height: auto; display: block; margin: 10px 0; }
:deep(.rbe-content blockquote) { margin: 10px 0; padding: 6px 12px; border-left: 3px solid #dcdfe6; color: #606266; background: #fafafa; }
:deep(.rbe-content pre) { background: #f5f7fa; padding: 10px 12px; border-radius: 4px; overflow: auto; }
:deep(.rbe-content ul), :deep(.rbe-content ol) { padding-left: 22px; margin: 0 0 10px; }
:deep(.rbe-content hr) { border: none; border-top: 1px solid #ebeef5; margin: 14px 0; }
/* Placeholder 由扩展给空段落挂 data-placeholder，样式必须 :deep 才能命中 ProseMirror 生成的节点 */
:deep(.rbe-content p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: #c0c4cc;
  pointer-events: none;
  height: 0;
}
</style>
