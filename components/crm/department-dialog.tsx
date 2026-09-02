"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Loader2, Plus, Building2 } from "lucide-react"
import { upsertCrmDepartment } from "@/app/actions/crm"
import type { CrmDepartment } from "@/lib/db/schema"

const deptSchema = z.object({
  name: z.string().min(2, "Department name is required"),
  description: z.string().optional(),
  active: z.boolean(),
})

type DeptFormValues = z.infer<typeof deptSchema>

export function DepartmentDialog({
  department,
  trigger,
}: {
  department?: CrmDepartment
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<DeptFormValues>({
    resolver: zodResolver(deptSchema),
    defaultValues: {
      name: department?.name || "",
      description: department?.description || "",
      active: department?.active ?? true,
    },
  })

  function onSubmit(values: DeptFormValues) {
    startTransition(async () => {
      try {
        const result = await upsertCrmDepartment({
          id: department?.id,
          ...values,
        })
        if (result.ok) {
          toast.success(`Department ${department ? "updated" : "created"} successfully`)
          setOpen(false)
          if (!department) form.reset()
          router.refresh()
        }
      } catch (err) {
        toast.error("Failed to save department")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase tracking-tighter">
            <Plus className="mr-1 h-3 w-3" /> Add Dept
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {department ? "Update Department" : "Add New Department"}
          </DialogTitle>
          <DialogDescription>
            Define the organizational unit responsible for handling specific complaint types.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Technical Field" {...field} />
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
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Explain what this department handles..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Active Status</FormLabel>
                    <p className="text-[10px] text-muted-foreground italic">If disabled, this department cannot be assigned to new tickets.</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {department ? "Save Changes" : "Create Department"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
