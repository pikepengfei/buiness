-- 014 rollback：模板库只是新增表，删表即回滚；
-- 已插入页面的区块是普通副本（不引用模板行），回滚后仍正常渲染。
DROP TABLE IF EXISTS block_templates;
