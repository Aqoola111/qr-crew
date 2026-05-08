"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/trpc/client";

const joinSchema = z.object({
  code: z.string().min(1, "הזינו קוד חדר"),
  displayName: z.string().max(80).optional(),
});

const createSchema = z.object({
  displayName: z.string().max(80).optional(),
  roomName: z.string().max(120).optional(),
});

type JoinValues = z.infer<typeof joinSchema>;
type CreateValues = z.infer<typeof createSchema>;

export function RoomForms() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: crew, isPending: crewPending } = useQuery(trpc.crew.me.queryOptions());

  const lockedDisplayName = crew?.session?.displayName?.trim() ?? null;
  /** Lock only when `BrowserSession.displayName` is set — a cookie/row without a name keeps the field enabled. */
  const nameFieldLocked = Boolean(lockedDisplayName);

  const joinMut = useMutation({
    ...trpc.crew.joinRoom.mutationOptions(),
    onSuccess: async (data) => {
      toast.success(
        data.rejoined ? `חזרת לחדר ${data.code}` : `הצטרפת לחדר ${data.code}`,
      );
      await queryClient.invalidateQueries(trpc.crew.me.queryFilter());
      router.push(`/room/${data.roomId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const createMut = useMutation({
    ...trpc.crew.createRoom.mutationOptions(),
    onSuccess: async (data) => {
      toast.success(`החדר מוכן — שתפו את הקוד ${data.code}`);
      await queryClient.invalidateQueries(trpc.crew.me.queryFilter());
      router.push(`/room/${data.roomId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const joinForm = useForm<JoinValues>({
    resolver: zodResolver(joinSchema),
    defaultValues: { code: "", displayName: "" },
  });

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { displayName: "", roomName: "" },
  });

  useEffect(() => {
    if (lockedDisplayName) {
      joinForm.setValue("displayName", lockedDisplayName);
      createForm.setValue("displayName", lockedDisplayName);
    }
  }, [lockedDisplayName, joinForm, createForm]);

  if (crewPending) {
    return (
      <div className="grid w-full gap-6 md:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid w-full gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>הצטרפות לחדר</CardTitle>
          <CardDescription>קוד בן־5 ספרות, או הדבקת ספרות מסריקת QR.</CardDescription>
        </CardHeader>
        <Form {...joinForm}>
          <form
            onSubmit={joinForm.handleSubmit((values) => {
              const effective =
                lockedDisplayName ?? values.displayName?.trim() ?? "";
              if (!effective) {
                toast.error("הזינו שם");
                return;
              }
              joinMut.mutate({
                code: values.code,
                displayName: effective,
              });
            })}
          >
            <CardContent className="space-y-4">
              <FormField
                control={joinForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>קוד חדר</FormLabel>
                    <FormControl>
                      <Input
                        dir="ltr"
                        className="font-mono"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="12345"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {nameFieldLocked ? (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">השם במכשיר הזה</span>
                  <p className="font-medium text-foreground">{lockedDisplayName}</p>
                  <p className="text-muted-foreground mt-1 text-xs">משמש בכל החדרים שאליהם נכנסים.</p>
                </div>
              ) : (
                <FormField
                  control={joinForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>השם שלך</FormLabel>
                      <FormControl>
                        <Input autoComplete="nickname" placeholder="לדוגמה: יוסי" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={joinMut.isPending}>
                {joinMut.isPending ? "מצטרפים…" : "הצטרף"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>יצירת חדר</CardTitle>
          <CardDescription>תהיו בעלי החדר ותקבלו קוד חדש לשיתוף.</CardDescription>
        </CardHeader>
        <Form {...createForm}>
          <form
            onSubmit={createForm.handleSubmit((values) => {
              const effective =
                lockedDisplayName ?? values.displayName?.trim() ?? "";
              if (!effective) {
                toast.error("הזינו שם");
                return;
              }
              createMut.mutate({
                displayName: effective,
                roomName: values.roomName?.trim() || undefined,
              });
            })}
          >
            <CardContent className="space-y-4">
              {nameFieldLocked ? (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">השם במכשיר הזה</span>
                  <p className="font-medium text-foreground">{lockedDisplayName}</p>
                  <p className="text-muted-foreground mt-1 text-xs">משמש ביצירה או הצטרפות לחדרים.</p>
                </div>
              ) : (
                <FormField
                  control={createForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>השם שלך</FormLabel>
                      <FormControl>
                        <Input autoComplete="nickname" placeholder="לדוגמה: יוסי" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={createForm.control}
                name="roomName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>שם לחדר (אופציונלי)</FormLabel>
                    <FormControl>
                      <Input placeholder="למשל: צוות מטבח" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={createMut.isPending}>
                {createMut.isPending ? "יוצרים…" : "צור חדר"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
