import { Mail, MapPin, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="container max-w-2xl py-14">
      <h1 className="text-3xl font-bold tracking-tight">Talk to us</h1>
      <p className="mt-3 text-muted-foreground">Questions about bookings, listing a venue or the platform itself.</p>
      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4 text-primary" /> Email</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">support@turf.example<br />Replies within a day.</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4 text-primary" /> WhatsApp</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">+91 90000 00000<br />Mon–Sat, 9am–9pm IST.</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" /> Office</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Andheri West,<br />Mumbai, India.</CardContent>
        </Card>
      </div>
    </div>
  );
}
