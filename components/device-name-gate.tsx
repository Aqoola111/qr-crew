"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrCreateLocalUserId } from "@/lib/local-user";
import { useTRPC } from "@/trpc/client";

const schema = z.object({
  displayName: z.string().min(1, "הזינו שם").max(80),
});

type FormValues = z.infer<typeof schema>;

/**
 * Blocks the rest of the home screen until the user has a server session with a display name.
 * Sends a stable browser-generated `localUserId` stored on `BrowserSession` for this device profile.
 */
export function DeviceNameGate({ children }: { children: React.ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const localUserId = useMemo(() => getOrCreateLocalUserId(), []);

  const { data: crew, isPending } = useQuery(trpc.crew.me.queryOptions());

  const needsName = useMemo(() => {
    if (!crew?.session) return true;
    return !crew.session.displayName?.trim();
  }, [crew?.session]);

  const register = useMutation({
    ...trpc.crew.registerDeviceProfile.mutationOptions(),
    onSuccess: async () => {
      toast.success("ברוך הבא — אפשר להצטרף או ליצור חדר למטה.");
      await queryClient.invalidateQueries(trpc.crew.me.queryFilter());
    },
    onError: (e) => toast.error(e.message),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "" },
  });

  if (isPending) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10 md:py-14">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full max-w-md rounded-xl" />
      </div>
    );
  }

  if (needsName) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 py-10 md:py-14">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">איך קוראים לך?</CardTitle>
            <CardDescription>
              השם שיופיע לצוות. נשמרת התחברות אנונימית קטנה במכשיר (ללא חשבון).
            </CardDescription>
          </CardHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => {
                if (!localUserId) {
                  toast.error("לא נוצר מזהה מכשיר — נסו דפדפן אחר או הפעילו אחסון.");
                  return;
                }
                register.mutate({
                  displayName: values.displayName.trim(),
                  localUserId,
                });
              })}
            >
              <CardContent>
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>השם שלך</FormLabel>
                      <FormControl>
                        <Input autoComplete="name" autoFocus placeholder="לדוגמה: יוסי" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={register.isPending}>
                  {register.isPending ? "שומרים…" : "המשך"}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
