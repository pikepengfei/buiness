<script setup lang="ts">
/**
 * 产品详细描述编辑器（Tiptap 3，产品私有）
 *
 * 与资讯正文编辑器各自一份：本文件不引用资讯目录的编辑器，资讯链改正文能力也不会波及产品描述。
 * 能力按 design D9 收口，只开后端白名单里产品描述用得上的部分：
 *  - 标题 h2/h3/h4（h1 留给页面标题）；
 *  - 粗体 / 斜体 / 有序无序列表 / 链接 / 图片；
 *  - 不装下划线、删除线、引用、代码、分隔线——描述区用不到，装了也只是让运营点了没效果；
 *  - 图片只能从素材库选取，没有直传与外链输入口；粘贴进来的站外图片客户端就地剥除，服务端再兜一层。
 * 字段位置与提交字段名沿用原来的详细描述（description），编辑器接管同一个值。
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

const canEdit = computed(() => props.editable !== false);
const HEADING_LEVELS = [2, 3, 4] as const;

const editor = useEditor({
  content: props.modelValue || '',
  editable: props.editable !== false,
  editorProps: {
    attributes: { class: 'pde-content' },
    // 粘贴内容里的 <img> 只认站内素材：外链图与 data: 就地丢弃，并给出下一步指引而不是静默吞掉
    transformPastedHTML: (html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      let removed = 0;
      doc.querySelectorAll('img').forEach((img) => {
        if (!isInternalSrc(img.getAttribute('src') || '')) {
          img.remove();
          removed++;
        }
      });
      if (removed) ElMessage.warning(`已移除粘贴内容中的 ${removed} 张站外图片，请从素材库选择后插入`);
      return doc.body.innerHTML;
    },
  },
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
      underline: false,
      strike: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
    }),
    Image.configure({ allowBase64: false, HTMLAttributes: { loading: 'lazy' } }),
    Placeholder.configure({ placeholder: props.placeholder || '请输入详细描述…（站外图片会被移除）' }),
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
  if (ed.isActive('link')) {
    ed.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
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

// 详细描述允许为空：这里只报「还没有内容」，不作为发布的拦截条件（与资讯正文不同）
const empty = computed(() => !String(props.modelValue || '').replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|\s/gi, '').length);
defineExpose({ focus: () => editor.value?.chain().focus().run() });
</script>

<template>
  <div class="pde">
    <div v-if="editor && canEdit" class="pde-bar">
      <el-button-group>
        <el-button size="small" :type="active('bold') ? 'primary' : ''" @click="act((e) => e.chain().toggleBold())">B</el-button>
        <el-button size="small" :type="active('italic') ? 'primary' : ''" @click="act((e) => e.chain().toggleItalic())">I</el-button>
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
      </el-button-group>
      <el-button-group>
        <el-button size="small" :type="active('link') ? 'primary' : ''" @click="setLink">
          <el-icon><Link /></el-icon>
        </el-button>
        <el-button size="small" @click="pickerVisible = true">
          <el-icon><Picture /></el-icon>
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
      <span class="pde-tip">Shift+Enter 换行 · 图片只能从素材库选 · 无对齐/字号/颜色/缩进/表格入口（官网渲染不保留）</span>
    </div>
    <EditorContent class="pde-body" :editor="editor" />
    <div v-if="canEdit && empty" class="pde-hint">详细描述可以为空：留空时官网详情页不渲染描述区，不影响发布</div>
    <MediaPicker v-model:visible="pickerVisible" @select="onPicked" />
  </div>
</template>

<style scoped>
.pde {
  width: 100%;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
}
.pde-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
}
.pde-tip {
  font-size: 12px;
  color: #909399;
}
.pde-body {
  background: #fff;
}
.pde-hint {
  padding: 6px 10px;
  font-size: 12px;
  color: #909399;
  background: #fafafa;
}
:deep(.pde-content) {
  min-height: 260px;
  padding: 14px 16px;
  outline: none;
  font-size: 14px;
  line-height: 1.8;
}
:deep(.pde-content h2) { font-size: 20px; margin: 14px 0 8px; }
:deep(.pde-content h3) { font-size: 17px; margin: 12px 0 6px; }
:deep(.pde-content h4) { font-size: 15px; margin: 10px 0 6px; }
:deep(.pde-content p) { margin: 0 0 10px; }
:deep(.pde-content img) { max-width: 100%; height: auto; display: block; margin: 10px 0; }
:deep(.pde-content ul), :deep(.pde-content ol) { padding-left: 22px; margin: 0 0 10px; }
/* Placeholder 由扩展给空段落挂 data-placeholder，样式必须 :deep 才能命中 ProseMirror 生成的节点 */
:deep(.pde-content p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: #c0c4cc;
  pointer-events: none;
  height: 0;
}
</style>
