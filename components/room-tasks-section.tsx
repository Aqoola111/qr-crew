"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { TaskUrgency, type MemberRole } from "@/app/generated/prisma/browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  durationBasisHe,
  formatDurationMsHe,
  taskStatusHe,
  taskUrgencyHe,
  taskUrgencyHintHe,
} from "@/lib/ui-he";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";

const taskFormSchema = z.object({
  title: z.string().min(1, "נדרש כותרת").max(200),
  description: z.string().max(5000).optional(),
  urgency: z.nativeEnum(TaskUrgency),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

function urgencyBadgeClass(u: TaskUrgency): string {
  switch (u) {
    case TaskUrgency.URGENT:
      return "bg-red-600 text-white hover:bg-red-600";
    case TaskUrgency.HIGH:
      return "bg-orange-600 text-white hover:bg-orange-600";
    case TaskUrgency.MEDIUM:
      return "bg-amber-500 text-black hover:bg-amber-500";
    case TaskUrgency.LOW:
    default:
      return "bg-muted text-foreground";
  }
}

function urgencyDot(u: TaskUrgency): string {
  switch (u) {
    case TaskUrgency.URGENT:
      return "bg-red-600 ring-1 ring-red-900/20";
    case TaskUrgency.HIGH:
      return "bg-orange-500 ring-1 ring-orange-900/20";
    case TaskUrgency.MEDIUM:
      return "bg-amber-400 ring-1 ring-amber-900/25";
    case TaskUrgency.LOW:
    default:
      return "bg-muted-foreground/45 ring-1 ring-foreground/10";
  }
}

type RoomTaskRow = {
  id: string;
  title: string;
  description: string | null;
  urgency: TaskUrgency;
  pendingApproval: boolean;
  status: "OPEN" | "IN_PROGRESS" | "DONE";
  assigneeId: string | null;
  createdAt: Date;
  assignee: { id: string; displayName: string } | null;
  createdBy: { id: string; displayName: string };
};

export function RoomTasksSection({
  roomId,
  memberId,
  memberRole,
}: {
  roomId: string;
  memberId: string;
  memberRole: MemberRole;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const canAddDirect = memberRole === "OWNER" || memberRole === "CONTRIBUTOR";

  const tasksQuery = useQuery({
    ...trpc.crew.roomTasks.queryOptions({ roomId }),
  });

  const invalidateTasks = () => {
    void queryClient.invalidateQueries(trpc.crew.roomTasks.queryFilter({ roomId }));
    void queryClient.invalidateQueries(trpc.crew.roomMembers.queryFilter({ roomId }));
  };

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      urgency: TaskUrgency.MEDIUM,
    },
  });

  const createTask = useMutation({
    ...trpc.crew.createRoomTask.mutationOptions(),
    onSuccess: async () => {
      form.reset({ title: "", description: "", urgency: TaskUrgency.MEDIUM });
      await invalidateTasks();
    },
    onError: (e) => toast.error(e.message),
  });

  const suggestTask = useMutation({
    ...trpc.crew.suggestRoomTask.mutationOptions(),
    onSuccess: async () => {
      toast.success("ההצעה נשלחה לאישור.");
      form.reset({ title: "", description: "", urgency: TaskUrgency.MEDIUM });
      await invalidateTasks();
    },
    onError: (e) => toast.error(e.message),
  });

  const acceptSuggestion = useMutation({
    ...trpc.crew.acceptRoomTaskSuggestion.mutationOptions(),
    onSuccess: async () => {
      await invalidateTasks();
    },
    onError: (e) => toast.error(e.message),
  });

  const claimTask = useMutation({
    ...trpc.crew.claimRoomTask.mutationOptions(),
    onSuccess: async () => {
      await invalidateTasks();
    },
    onError: (e) => toast.error(e.message),
  });

  const startTask = useMutation({
    ...trpc.crew.startTask.mutationOptions(),
    onSuccess: async () => {
      await invalidateTasks();
    },
    onError: (e) => toast.error(e.message),
  });

  const completeTask = useMutation({
    ...trpc.crew.completeTask.mutationOptions(),
    onSuccess: async () => {
      await invalidateTasks();
    },
    onError: (e) => toast.error(e.message),
  });

  function onSubmitTask(values: TaskFormValues) {
    const payload = {
      roomId,
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      urgency: values.urgency,
    };
    if (canAddDirect) {
      createTask.mutate(payload);
    } else {
      suggestTask.mutate(payload);
    }
  }

  const pending = createTask.isPending || suggestTask.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">משימות בחדר</CardTitle>
          <CardDescription>
            משימות פתוחות ממוינות לפי דחיפות. אפשר לשאר עם «אני אעשה את זה». משימות שהושלמו עם זמן סיום מופיעות
            למטה באותה רשימה.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div>
            <h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">פתוחות</h3>
            {tasksQuery.isPending ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : tasksQuery.isError ? (
              <p className="text-destructive text-sm">{tasksQuery.error.message}</p>
            ) : tasksQuery.data.published.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין עדיין משימות פתוחות.</p>
            ) : (
              <ul className="space-y-3">
                {tasksQuery.data.published.map((t) => (
                  <PublishedTaskRow
                    key={t.id}
                    task={t as RoomTaskRow}
                    memberId={memberId}
                    memberRole={memberRole}
                    onClaim={() => claimTask.mutate({ roomId, taskId: t.id })}
                    onStart={() => startTask.mutate({ roomId, taskId: t.id })}
                    onComplete={() => completeTask.mutate({ roomId, taskId: t.id })}
                    claimPending={claimTask.isPending}
                    startPending={startTask.isPending}
                    completePending={completeTask.isPending}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="border-border border-t pt-8">
            <h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">הושלמו</h3>
            {tasksQuery.isPending ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : tasksQuery.isError ? null : tasksQuery.data.history.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין עדיין משימות שהושלמו.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border">
                {tasksQuery.data.history.map((row) => {
                  const completedByName =
                    row.completedBy?.displayName ?? row.assignee?.displayName ?? "—";
                  const assigneeName = row.assignee?.displayName ?? "—";
                  const when = new Date(row.completedAt!).toLocaleString("he-IL");
                  return (
                    <li key={row.id} className="space-y-1 px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{row.title}</span>
                        <Badge className={urgencyBadgeClass(row.urgency)}>{taskUrgencyHe(row.urgency)}</Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        בוצע על ידי <span className="text-foreground font-medium">{completedByName}</span>
                        {assigneeName !== completedByName ? (
                          <>
                            {" "}
                            · בוצע במקור על ידי <span className="text-foreground font-medium">{assigneeName}</span>
                          </>
                        ) : null}
                        {" · "}
                        {when}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        <span className="text-foreground font-medium tabular-nums">
                          {formatDurationMsHe(row.durationMs)}
                        </span>
                        <span> ({durationBasisHe(row.durationBasis)})</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {canAddDirect && tasksQuery.data && tasksQuery.data.pendingSuggestions.length > 0 ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">הצעות לאישור</CardTitle>
            <CardDescription>אישור מפרסם לכל החדר. ממוין מהחדש לישן.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasksQuery.data.pendingSuggestions.map((t) => (
              <SuggestionRow
                key={t.id}
                task={t as RoomTaskRow}
                onAccept={() => acceptSuggestion.mutate({ roomId, taskId: t.id })}
                busy={acceptSuggestion.isPending}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {(canAddDirect || memberRole === "MEMBER") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{canAddDirect ? "הוספת משימה" : "הצעת משימה"}</CardTitle>
            <CardDescription>
              {canAddDirect
                ? "המשימות מופיעות לרשימת החדר לכל מי שרוצה לקחת. הדחיפות קובעת את סדר המיון."
                : "מובילים מאשרים הצעות למטה. משימות שאושרו מוצגות לכולם."}
            </CardDescription>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitTask)}>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>כותרת</FormLabel>
                      <FormControl>
                        <Input placeholder="כותרת קצרה" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>תיאור (אופציונלי)</FormLabel>
                      <FormControl>
                        <textarea
                          className={cn(
                            "border-input bg-background placeholder:text-muted-foreground flex min-h-[88px] w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 text-start",
                          )}
                          placeholder="פרטים, קישורים, קריטריונים לקבלה…"
                          dir="auto"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="urgency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>דחיפות</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => field.onChange(v as TaskUrgency)}
                        disabled={pending}
                      >
                        <FormControl>
                          <SelectTrigger
                            ref={field.ref}
                            className="w-full"
                            aria-invalid={!!form.formState.errors.urgency}
                            onBlur={field.onBlur}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                              <span
                                className={cn("size-2 shrink-0 rounded-full", urgencyDot(field.value))}
                                aria-hidden
                              />
                              <SelectValue placeholder="בחרו דחיפות" />
                            </div>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent position="popper" sideOffset={6} align="start" className="max-h-72">
                          {[TaskUrgency.LOW, TaskUrgency.MEDIUM, TaskUrgency.HIGH, TaskUrgency.URGENT].map((u) => (
                            <SelectItem key={u} value={u} textValue={taskUrgencyHe(u)}>
                              <span className="flex items-start gap-2.5 py-0.5">
                                <span
                                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", urgencyDot(u))}
                                  aria-hidden
                                />
                                <span className="flex min-w-0 flex-col gap-0.5 text-start">
                                  <span className="leading-tight font-medium">{taskUrgencyHe(u)}</span>
                                  <span className="text-muted-foreground text-xs font-normal leading-snug">
                                    {taskUrgencyHintHe(u)}
                                  </span>
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-0 sm:flex-row">
                <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
                  {pending ? "שומרים…" : canAddDirect ? "הוסף משימה" : "שלחו הצעה"}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      )}
    </div>
  );
}

function SuggestionRow({
  task,
  onAccept,
  busy,
}: {
  task: RoomTaskRow;
  onAccept: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{task.title}</span>
            <Badge className={urgencyBadgeClass(task.urgency)}>{taskUrgencyHe(task.urgency)}</Badge>
          </div>
          {task.description ? <p className="text-muted-foreground text-sm whitespace-pre-wrap">{task.description}</p> : null}
          <p className="text-muted-foreground text-xs">
            הוצע על ידי {task.createdBy.displayName} · {new Date(task.createdAt).toLocaleString("he-IL")}
          </p>
        </div>
        <Button type="button" size="sm" onClick={onAccept} disabled={busy}>
          {busy ? "…" : "אשר"}
        </Button>
      </div>
    </div>
  );
}

function PublishedTaskRow({
  task,
  memberId,
  memberRole,
  onClaim,
  onStart,
  onComplete,
  claimPending,
  startPending,
  completePending,
}: {
  task: RoomTaskRow;
  memberId: string;
  memberRole: MemberRole;
  onClaim: () => void;
  onStart: () => void;
  onComplete: () => void;
  claimPending: boolean;
  startPending: boolean;
  completePending: boolean;
}) {
  const unclaimed = !task.assigneeId;
  const isMine = task.assigneeId === memberId;
  const canManage = memberRole === "OWNER" || memberRole === "CONTRIBUTOR";
  const showStart =
    Boolean(task.assigneeId) && task.status === "OPEN" && (isMine || canManage);
  const showDone =
    Boolean(task.assigneeId) &&
    (task.status === "OPEN" || task.status === "IN_PROGRESS") &&
    (isMine || canManage);

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{task.title}</span>
            <Badge className={urgencyBadgeClass(task.urgency)}>{taskUrgencyHe(task.urgency)}</Badge>
            <Badge variant="outline" className="text-xs font-normal">
              {taskStatusHe(task.status)}
            </Badge>
          </div>
          {task.description ? <p className="text-muted-foreground text-sm whitespace-pre-wrap">{task.description}</p> : null}
          {unclaimed ? (
            <p className="text-muted-foreground text-xs">לא שויכה — כל אחד יכול לקחת.</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              משוייכת ל־<span className="text-foreground font-medium">{task.assignee?.displayName ?? "—"}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {unclaimed ? (
            <Button type="button" size="sm" disabled={claimPending} onClick={onClaim}>
              {claimPending ? "…" : "אני אעשה את זה"}
            </Button>
          ) : null}
          {showStart ? (
            <Button type="button" size="sm" variant="secondary" disabled={startPending} onClick={onStart}>
              {startPending ? "…" : "התחל"}
            </Button>
          ) : null}
          {showDone ? (
            <Button type="button" size="sm" variant="outline" disabled={completePending} onClick={onComplete}>
              {completePending ? "…" : "סמן כהושלם"}
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
