import { createFileRoute } from "@tanstack/react-router";
import DataPage from "@/components/DataPage";
import { Tag } from "antd";

export const Route = createFileRoute("/_admin/audit-logs")({
  component: () => (
    <DataPage
      resource="audit-logs"
      readOnly
      showStatusFilter={false}
      columns={[
        { title: "Time", dataIndex: "created_at", width: 190 },
        { title: "Admin", dataIndex: "actor_email", width: 220 },
        { title: "Action", dataIndex: "action", width: 180, render: (v) => <Tag color="blue">{v}</Tag> },
        { title: "Target", dataIndex: "entity_type", width: 180 },
        { title: "Target ID", dataIndex: "entity_id", width: 120 },
        { title: "Details", dataIndex: "details" },
      ]}
      editableFields={[]}
    />
  ),
});
