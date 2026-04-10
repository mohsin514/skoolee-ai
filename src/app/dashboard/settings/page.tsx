"use client";

import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Save, Building2, Globe, Palette } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  return (
    <>
      <Header title="Settings" description="Manage your school configuration" />

      <div className="p-6 space-y-6 max-w-3xl">
        {/* School Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              School Information
            </CardTitle>
            <CardDescription>
              Update your school&apos;s profile information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4">
              <div className="space-y-2">
                <Label>School Name</Label>
                <Input placeholder="Springfield Elementary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="admin@school.edu" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input placeholder="+92 300 1234567" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea placeholder="School address..." rows={2} />
              </div>
              <Button
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  toast.success("Settings saved!");
                }}
              >
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Domain */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Custom Domain
            </CardTitle>
            <CardDescription>
              Configure a custom domain for your school portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Subdomain</Label>
                <div className="flex items-center gap-1">
                  <Input placeholder="springfield" className="rounded-r-none" />
                  <span className="flex h-10 items-center rounded-r-lg border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                    .skooleeai.com
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Custom Domain (Pro plan)</Label>
                <Input placeholder="results.myschool.edu.pk" disabled />
                <p className="text-xs text-muted-foreground">
                  Upgrade to Pro to use your own domain.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Branding */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Branding
            </CardTitle>
            <CardDescription>
              Customize your report card appearance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>School Logo</Label>
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 text-sm text-muted-foreground">
                  Drag & drop or click to upload
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
