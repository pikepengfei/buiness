-- =============================================================================
-- 014：区块模板库（decoration-editor-toolkit）
-- 模板 = 单个区块自身 props 的快照（children 子内容属于页面实例，不入库），
-- 供装修编辑器「存为模板 / 从模板插入」复用。类型语义是否可用由前端注册表判定
-- （isTemplateUsable，类型下线的模板标记不可用），后端不重复维护类型清单。
-- =============================================================================
CREATE TABLE block_templates (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(80) NOT NULL,                  -- 模板名；与类型联合唯一，迫使命名收敛
  type        VARCHAR(40) NOT NULL,                  -- 区块类型（sectionRegistry 的 key 形态）
  props       JSONB       NOT NULL DEFAULT '{}'::jsonb, -- 区块自身内容（deepSanitize 后），体积 ≤ 256KB、list 类字段 ≤ 200 条由接口校验
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT block_templates_name_type_key UNIQUE (name, type)
);
CREATE INDEX block_templates_type_created_idx ON block_templates (type, created_at DESC);
CREATE TRIGGER trg_block_templates_updated_at BEFORE UPDATE ON block_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE block_templates IS '区块模板：装修编辑器存为模板的区块 props 快照，children 不入库（decoration-editor-toolkit）';
