/** Stable subset of API v1. Additional response fields are retained at runtime. */
export type JSONRecord = Record<string, unknown>;
export type Priority = "low" | "medium" | "high" | "urgent";
export interface Task {
  task_id: string; task_key: string; title: string; priority: Priority;
  revision: number; project_id?: string;
}
export interface TaskInput {
  project_id: string; title: string; task_workflow_status_id?: string;
  description?: string; priority?: Priority; type?: string; severity?: string;
  client_id?: string; due_date?: string; billable?: boolean;
}
export interface TaskPage {
  tasks: {items: Task[]; total: number; limit: number; offset: number};
}
export interface ToolCall {
  ai_tool_call_id: string; tool_key: string; status: string;
  requires_approval: boolean; input_json?: JSONRecord; output_json?: JSONRecord;
}
export interface AISession {
  ai_chat_session_id: string; project_id: string; status: string;
  messages: {role: string; body: string}[]; tool_calls?: ToolCall[];
}
export interface AIMessage {
  body: string; page_context_json?: JSONRecord; client_context_json?: JSONRecord;
  active_tool_call_id?: string; local_date?: string; timezone?: string;
}
export interface RequestOptions {signal?: AbortSignal}
