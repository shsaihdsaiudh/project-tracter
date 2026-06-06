export function EmptyState() {
  return (
    <div
      className="text-center py-16 px-4"
      style={{ color: "var(--color-text-muted)" }}
    >
      <div className="text-[40px] mb-3.5">&#128203;</div>
      <h2
        className="text-[15px] font-semibold mb-2"
        style={{ color: "var(--color-text-primary)" }}
      >
        当前没有活跃项目
      </h2>
      <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        点击左侧「+ 添加项目」追踪项目
        <br />
        和 Claude Code 对话后，会话会自动显示在这里
      </p>
    </div>
  );
}
