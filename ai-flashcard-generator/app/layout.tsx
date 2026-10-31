import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { SocialProvider } from "@/components/SocialProvider";
import ConsentGate from "@/components/ConsentGate";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Pet from "@/components/Pet";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Flashly – AI flashcards & quizzes from your notes",
    template: "%s · Flashly",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Flashly – AI flashcards & quizzes from your notes",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Flashly – AI flashcards & quizzes from your notes",
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff8ee" },
    { media: "(prefers-color-scheme: dark)", color: "#130f26" },
  ],
};

// Runs before first paint so the saved (or system) theme and accent never flash.
const themeScript = `(function(){try{var d=document.documentElement,t=localStorage.getItem('flashly-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t;var a=localStorage.getItem('flashly-accent');if(a){if(/^#[0-9a-fA-F]{6}$/.test(a)){var n=parseInt(a.slice(1),16),l=(0.299*(n>>16)+0.587*((n>>8)&255)+0.114*(n&255))/255;d.dataset.accent='custom';d.style.setProperty('--user-accent',a);d.style.setProperty('--user-on',l>0.6?'#1b1033':'#ffffff')}else{d.dataset.accent=a}}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <SocialProvider>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <Pet />
          <ConsentGate />
          </SocialProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
