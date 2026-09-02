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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Loader2, Plus, Tag } from "lucide-react"
import { upsertCrmComplaintCategory } from "@/app/actions/crm"
import type { CrmComplaintCategory, CrmDepartment } from "@/lib/db/schema"

const categorySchema = z.object({
  name: z.string().min(2, "Category name is required"),
  description: z.string().optional(),
  defaultHandlerDepartmentId: z.string().nullable().optional(),
  active: z.boolean(),
})

type CategoryFormValues = z.infer<typeof categorySchema>

export function CategoryDialog({
  category,
  departments,
  trigger,
}: {
  category?: CrmComplaintCategory
  departments: CrmDepartment[]
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name || "",
      description: category?.description || "",
      defaultHandlerDepartmentId: category?.defaultHandlerDepartmentId || null,
      active: category?.active ?? true,
    },
  })

  function onSubmit(values: CategoryFormValues) {
    startTransition(async () => {
      try {
        const result = await upsertCrmComplaintCategory({
          id: category?.id,
          ...values,
        })
        if (result.ok) {
          toast.success(`Category ${category ? "updated" : "created"} successfully`)
          setOpen(false)
          if (!category) form.reset()
          router.refresh()
        }
      } catch (err) {
        toast.error("Failed to save category")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase tracking-tighter">
            <Plus className="mr-1 h-3 w-3" /> Add Category
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-emerald-500" />
            {category ? "Update Category" : "Add New Category"}
          </DialogTitle>
          <DialogDescription>
            Categorize customer issues (e.g. Leakage) and route them to the correct department.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Faulty Meter" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="defaultHandlerDepartmentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Handling Department</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(val === "none" ? null : val)}
                    value={field.value || "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No Department</SelectItem>
                      {departments.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                {category ? "Save Changes" : "Create Category"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
