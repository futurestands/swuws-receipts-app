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
  FormDescription,
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
import { toast } from "sonner"
import { Plus, Loader2, User, Phone, MapPin, MessageSquare, ShieldAlert } from "lucide-react"
import { registerComplaint } from "@/app/actions/crm"
import type { CrmDepartment, CrmComplaintCategory } from "@/lib/db/schema"

const complaintSchema = z.object({
  complainantName: z.string().min(2, "Name is required"),
  complainantPhone: z.string().min(10, "Valid phone number is required"),
  complainantEmail: z.string().email().optional().or(z.literal("")),
  complainantAddress: z.string().optional(),
  customerAccount: z.string().optional(),
  categoryId: z.string().min(1, "Category is required"),
  priority: z.enum(["low", "medium", "high", "critical"]),
  details: z.string().min(5, "Please provide more detail about the issue"),
  language: z.string(),
})

type ComplaintFormValues = z.infer<typeof complaintSchema>

export function RegisterComplaintDialog({
  departments,
  categories,
}: {
  departments: CrmDepartment[]
  categories: CrmComplaintCategory[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<ComplaintFormValues>({
    resolver: zodResolver(complaintSchema),
    defaultValues: {
      complainantName: "",
      complainantPhone: "+256",
      complainantEmail: "",
      complainantAddress: "",
      customerAccount: "",
      categoryId: "",
      priority: "medium",
      details: "",
      language: "English",
    },
  })

  function onSubmit(values: ComplaintFormValues) {
    startTransition(async () => {
      try {
        const result = await registerComplaint(values)
        if (result.ok) {
          toast.success(`Complaint registered: ${result.complaintNumber}`)
          setOpen(false)
          form.reset()
          router.refresh()
        } else {
          toast.error("Failed to register complaint")
        }
      } catch (err) {
        toast.error("An unexpected error occurred")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11">
          <Plus className="mr-2 h-4 w-4" /> Register Complaint
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
             <MessageSquare className="h-5 w-5 text-primary" />
             Register New Complaint
          </DialogTitle>
          <DialogDescription>
            Capture customer technical or financial issues for tracking and resolution.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="complainantName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                       <User className="h-3 w-3" /> Complainant Name
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Full Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="complainantPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                       <Phone className="h-3 w-3" /> Phone Number
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="+256..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <FormField
                control={form.control}
                name="customerAccount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                       <ShieldAlert className="h-3 w-3" /> Customer Account (Optional)
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 6000..." {...field} />
                    </FormControl>
                    <FormDescription className="text-[10px]">Links complaint to a customer profile.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred Language</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="English">English</SelectItem>
                        <SelectItem value="Luganda">Luganda</SelectItem>
                        <SelectItem value="Runyankore">Runyankore</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Complaint Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority Level</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="complainantAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                     <MapPin className="h-3 w-3" /> Area / Location
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Village, Plot, or Landmark" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Complaint Details</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Provide specific details about the issue..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" className="min-w-[150px]" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Complaint Details"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
