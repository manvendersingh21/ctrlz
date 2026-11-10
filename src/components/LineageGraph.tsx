"use client";

import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import dagre from "@dagrejs/dagre";
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { Brain, MessageSquare, Zap } from "lucide-react";
import type { Snapshot } from "@/lib/state";
import { cn } from "./cn";

type LineageNode = Snapshot["lineage"][number];
type NodeData = { kind: LineageNode["kind"]; label: string; status: string; tainted: boolean; selected: boolean; agentId: string };

const W = 230;
const H = 58;

const statusStyle: Record<string, string> = {
  quarantined: "border-danger/70 bg-danger/10",
  compensated: "border-warn/60 bg-warn/10",
  kept: "border-ok/60 bg-ok/10",
  held: "border-violet/70 border-dashed bg-violet/10",
  deduped: "border-info/60 bg-info/10",
};

function CtrlzNode({ data }: NodeProps<Node<NodeData>>) {
  const Icon = data.kind === "message" ? MessageSquare : data.kind === "memory" ? Brain : Zap;
  return (
    <div
      className={cn(
        "relative flex h-[58px] w-[230px] cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-[#1e1033]/90 px-2.5 py-2 text-left shadow-sm backdrop-blur-md transition-shadow",
        statusStyle[data.status],
        data.selected && "ring-2 ring-accent",
        data.tainted && !statusStyle[data.status] && "border-danger/60",
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-muted" />
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", data.kind === "memory" ? "text-violet" : data.kind === "action" ? "text-warn" : "text-info")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted">
          <span>{data.kind}</span>
          <span>·</span>
          <span>{data.agentId}</span>
          {data.status && !["ok", "seed", "active", "executed"].includes(data.status) && <span className="ml-auto font-semibold normal-case">{data.status}</span>}
        </div>
        <div className={cn("line-clamp-2 text-[11px] leading-tight", data.status === "compensated" && "line-through opacity-70")}>{data.label}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-muted" />
    </div>
  );
}


const nodeTypes = { ctrlz: CtrlzNode };

function layout(lineage: LineageNode[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 14, ranksep: 70, marginx: 10, marginy: 10 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(lineage.map((n) => n._id));
  for (const n of lineage) g.setNode(n._id, { width: W, height: H });
  for (const n of lineage) for (const p of n.parents) if (ids.has(p)) g.setEdge(p, n._id);
  dagre.layout(g);
  return (id: string) => {
    const p = g.node(id);
    return { x: p.x - W / 2, y: p.y - H / 2 };
  };
}

export function LineageGraph({ lineage, tainted, selected, onSelect }: { lineage: LineageNode[]; tainted: Set<string>; selected: string | null; onSelect: (id: string) => void }) {
  const { nodes, edges } = useMemo(() => {
    const pos = layout(lineage);
    const ids = new Set(lineage.map((n) => n._id));
    const nodes: Node<NodeData>[] = lineage.map((n) => ({
      id: n._id,
      type: "ctrlz",
      position: pos(n._id),
      // Fixed size (matches the node's CSS) so nodes are visible without waiting on a ResizeObserver pass.
      width: W,
      height: H,
      data: { kind: n.kind, label: n.label, status: n.status, tainted: tainted.has(n._id), selected: n._id === selected, agentId: n.agentId },
      draggable: false,
    }));
    const edges: Edge[] = lineage.flatMap((n) =>
      n.parents
        .filter((p) => ids.has(p))
        .map((p) => {
          const hot = tainted.has(p) && tainted.has(n._id);
          return { id: `${p}->${n._id}`, source: p, target: n._id, animated: hot, style: { stroke: hot ? "var(--danger)" : "var(--muted)", strokeOpacity: hot ? 0.9 : 0.4, strokeWidth: hot ? 1.6 : 1 } };
        }),
    );
    return { nodes, edges };
  }, [lineage, tainted, selected]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => onSelect(n.id)}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
    >
      <Background gap={20} size={1} color="var(--line)" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}
