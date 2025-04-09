import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, FileText, Zap, Database, CheckCircle, Upload, Code, Lightbulb } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-white text-black">
      {/* Header/Navigation */}
      <header className="border-b border-gray-100 shadow-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-black" />
            <span className="text-xl font-bold">Data Synthetix</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#how-it-works" className="text-sm font-medium hover:text-gray-700 transition-colors">How It Works</a>
            <a href="#benefits" className="text-sm font-medium hover:text-gray-700 transition-colors">Benefits</a>
            <a href="#pricing" className="text-sm font-medium hover:text-gray-700 transition-colors">Pricing</a>
            <a href="#faq" className="text-sm font-medium hover:text-gray-700 transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="outline" className="border-black text-black hover:bg-gray-50">Login</Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-black text-white hover:bg-gray-800">Sign Up</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 lg:py-32">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            Transform Your Documents Into <br />
            <span className="text-black relative">
              Fine-Tuning Ready Data
              <div className="absolute -bottom-2 left-0 right-0 h-1 bg-black opacity-10 rounded-full"></div>
            </span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-10">
            Generate high-quality synthetic training data from your organization's documents
            with perfect fidelity to your unique language, tone, and formatting.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="bg-black text-white hover:bg-gray-800 px-8 py-6 text-lg shadow-md">
                Start Free Trial
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="border-black text-black hover:bg-gray-50 px-8 py-6 text-lg">
              Book Demo
            </Button>
          </div>
          
          <div className="mt-16 relative mx-auto max-w-5xl">
            <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200">
              <div className="bg-gray-50 border-b border-gray-200 p-4 flex items-center">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <div className="ml-4 text-sm text-gray-700 font-medium">Data Synthetix Dashboard</div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-5 gap-4">
                  <div className="col-span-2 bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm">
                    <div className="text-sm font-medium mb-3">Upload Documents</div>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center">
                      <Upload className="h-10 w-10 text-gray-400 mb-2" />
                      <div className="text-sm text-gray-500">Drag & drop files or click to browse</div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <div className="bg-black text-white text-xs px-3 py-1 rounded">Upload</div>
                    </div>
                  </div>
                  <div className="col-span-3 bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm">
                    <div className="text-sm font-medium mb-3">Generated Synthetic Data</div>
                    <div className="bg-black rounded-lg p-4 font-mono text-xs text-gray-300 overflow-hidden">
                      <div className="text-gray-400">// JSONL output ready for fine-tuning</div>
                      <div className="mt-2">{"{"}</div>
                      <div className="ml-4">"input": "The company shall pay a fee of $5,000 upon signing this agreement.",</div>
                      <div className="ml-4">"output": "The client will make a payment of $7,500 upon execution of this contract."</div>
                      <div>{"}"}</div>
                      <div className="mt-2">{"{"}</div>
                      <div className="ml-4">"input": "All proprietary information shall remain confidential for 5 years.",</div>
                      <div className="ml-4">"output": "Any sensitive materials must be kept private for a period of 3 years."</div>
                      <div>{"}"}</div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <div className="bg-black text-white text-xs px-3 py-1 rounded">Download JSONL</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Explanation Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl font-bold mb-6">AI-Powered Synthetic Data Generation</h2>
            <p className="text-lg text-gray-600">
              Our proprietary AI platform transforms your organization's documents into high-quality 
              synthetic training data that perfectly matches your unique language patterns and style. 
              The output is ready for fine-tuning your AI models without any manual cleanup.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl font-bold mb-4">No More Tedious Data Creation</h3>
              <p className="text-gray-600 mb-6">
                Traditional methods of creating training data are time-consuming and error-prone. 
                Our platform automates the entire process, from extraction to generation, 
                so you can focus on building better AI models instead of cleaning up data.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start">
                  <CheckCircle className="h-6 w-6 text-black mr-2 flex-shrink-0 mt-0.5" />
                  <span>Upload any document format including PDFs, DOCXs, and more</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-6 w-6 text-black mr-2 flex-shrink-0 mt-0.5" />
                  <span>Perfect fidelity extraction preserves your exact content</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-6 w-6 text-black mr-2 flex-shrink-0 mt-0.5" />
                  <span>Generate variations that maintain your organization's unique style</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-6 w-6 text-black mr-2 flex-shrink-0 mt-0.5" />
                  <span>Export fine-tuning ready JSONL with perfect formatting</span>
                </li>
              </ul>
            </div>
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 shadow-md">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                  <FileText className="h-8 w-8 text-black mb-2" />
                  <h4 className="font-medium mb-1">Advanced Content Extraction</h4>
                  <p className="text-sm text-gray-600">
                    Our proprietary technology extracts structured content from documents with perfect fidelity.
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                  <Zap className="h-8 w-8 text-black mb-2" />
                  <h4 className="font-medium mb-1">Intelligent Data Generation</h4>
                  <p className="text-sm text-gray-600">
                    Creates synthetic variants that match your exact language, tone, and formatting style.
                  </p>
                </div>
                <div className="col-span-2 mt-2 bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <div className="font-medium">Input → Output</div>
                    <div className="text-xs text-gray-500">Maintaining style & intent</div>
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm">
                      <div className="font-medium text-gray-700">Original:</div>
                      <div className="text-gray-600 bg-gray-50 p-2 rounded">Consultant shall submit invoices on a monthly basis.</div>
                    </div>
                    <div className="text-sm">
                      <div className="font-medium text-black">Synthetic Variant:</div>
                      <div className="text-gray-600 bg-gray-50 p-2 rounded">Contractor shall provide billing statements every four weeks.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl font-bold mb-6">How It Works</h2>
            <p className="text-lg text-gray-600">
              Our streamlined three-step process makes creating synthetic training data simple and efficient.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="shadow-md border-gray-200">
              <CardHeader>
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Upload className="h-6 w-6 text-black" />
                </div>
                <CardTitle>1. Upload Your Documents</CardTitle>
                <CardDescription>
                  Simply upload your organization's documents: contracts, financial statements, SOPs, or any text-based files.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  Our platform supports various document formats including PDF, DOCX, TXT, and more. 
                  Your data remains private and secure throughout the process.
                </p>
              </CardContent>
            </Card>
            
            <Card className="shadow-md border-gray-200">
              <CardHeader>
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-black" />
                </div>
                <CardTitle>2. AI Processing</CardTitle>
                <CardDescription>
                  Our proprietary AI technology processes your content and generates high-quality synthetic variants.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  Using our advanced algorithms, we analyze your documents and create variations
                  that maintain your unique language patterns, tone, and formatting.
                </p>
              </CardContent>
            </Card>
            
            <Card className="shadow-md border-gray-200">
              <CardHeader>
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Database className="h-6 w-6 text-black" />
                </div>
                <CardTitle>3. Download Training Data</CardTitle>
                <CardDescription>
                  Receive perfectly formatted JSONL files ready for fine-tuning your AI models.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  No manual cleanup required. Your synthetic data is structured as input-output 
                  pairs, ready to use for training or fine-tuning custom AI models.
                </p>
              </CardContent>
            </Card>
          </div>
          
          <div className="mt-12 bg-white border border-gray-200 shadow-sm rounded-lg p-6 max-w-3xl mx-auto">
            <div className="flex items-start">
              <div className="bg-gray-100 p-2 rounded-full mr-4 mt-1">
                <CheckCircle className="h-6 w-6 text-black" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Your Data Privacy Is Our Priority</h3>
                <p className="text-gray-600">
                  We <span className="font-medium">automatically delete all uploaded documents</span> once processing is complete. 
                  Our platform is designed for secure, on-demand generation of training data without storing your source documents. 
                  We never save, analyze, or use your documents beyond the specific data generation task you request.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Benefits Section */}
      <section id="benefits" className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl font-bold mb-6">Benefits</h2>
            <p className="text-lg text-gray-600">
              Save time and resources while getting better results with our synthetic data generator.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-md">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-6 w-6 text-black" />
              </div>
              <h3 className="text-xl font-bold mb-3">No Manual Cleanup</h3>
              <p className="text-gray-600">
                Our platform generates perfectly formatted JSONL files with no need for manual cleanup or post-processing.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-md">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Code className="h-6 w-6 text-black" />
              </div>
              <h3 className="text-xl font-bold mb-3">Fine-Tuning Ready</h3>
              <p className="text-gray-600">
                Generated data is structured in the exact format required for fine-tuning OpenAI, Anthropic, or other AI models.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-md">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-black" />
              </div>
              <h3 className="text-xl font-bold mb-3">Organization-Specific Style</h3>
              <p className="text-gray-600">
                Our Duplicator model perfectly mimics your unique language patterns, terminology, and formatting style.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-md">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Lightbulb className="h-6 w-6 text-black" />
              </div>
              <h3 className="text-xl font-bold mb-3">No Prompt Engineering</h3>
              <p className="text-gray-600">
                Our platform handles all the complexity. No need to craft or optimize prompts to get high-quality results.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-md">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-black" />
              </div>
              <h3 className="text-xl font-bold mb-3">10x Faster Development</h3>
              <p className="text-gray-600">
                Create thousands of high-quality training examples in minutes instead of weeks of manual data creation.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-md relative overflow-hidden">
              <div className="absolute -right-6 -top-6 bg-black w-12 h-12 rotate-45"></div>
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Database className="h-6 w-6 text-black" />
              </div>
              <h3 className="text-xl font-bold mb-3">Complete Data Privacy</h3>
              <p className="text-gray-600">
                Your documents are automatically deleted after processing completes. We never store, analyze, or use your source files beyond your specific request.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl font-bold mb-6">Simple, Transparent Pricing</h2>
            <p className="text-lg text-gray-600">
              Choose the plan that works best for your organization's needs
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-bold mb-2">Starter</h3>
                <div className="flex items-baseline mb-4">
                  <span className="text-4xl font-bold">$20</span>
                  <span className="text-gray-600 ml-2">/month</span>
                </div>
                <p className="text-sm text-gray-600">
                  Perfect for individuals and small teams getting started with AI fine-tuning
                </p>
              </div>
              <div className="p-6">
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>5,000 synthetic samples per month</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>Up to 50MB file uploads</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>JSONL export format</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>Email support</span>
                  </li>
                </ul>
                <Link href="/signup">
                  <Button className="w-full bg-black text-white hover:bg-gray-800">
                    Sign Up
                  </Button>
                </Link>
              </div>
            </div>
            
            <div className="bg-white rounded-xl border-2 border-black shadow-xl overflow-hidden relative scale-105">
              <div className="absolute top-0 right-0 bg-black text-white text-xs px-3 py-1 rounded-bl">
                Popular
              </div>
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-bold mb-2">Professional</h3>
                <div className="flex items-baseline mb-4">
                  <span className="text-4xl font-bold">$40</span>
                  <span className="text-gray-600 ml-2">/month</span>
                </div>
                <p className="text-sm text-gray-600">
                  Ideal for businesses looking to scale their AI training data generation
                </p>
              </div>
              <div className="p-6">
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>15,000 synthetic samples per month</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>Up to 200MB file uploads</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>Multiple export formats</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>Priority email support</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>Advanced style matching</span>
                  </li>
                </ul>
                <Link href="/signup">
                  <Button className="w-full bg-black text-white hover:bg-gray-800">
                    Sign Up
                  </Button>
                </Link>
              </div>
            </div>
            
            <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-bold mb-2">Enterprise</h3>
                <div className="flex items-baseline mb-4">
                  <span className="text-4xl font-bold">Custom</span>
                </div>
                <p className="text-sm text-gray-600">
                  For organizations with unique needs and large-scale data requirements
                </p>
              </div>
              <div className="p-6">
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>Unlimited synthetic samples</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>Unlimited file uploads</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>Custom export formats</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>Dedicated account manager</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>Custom integration options</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-black mr-2 flex-shrink-0" />
                    <span>SLA and priority support</span>
                  </li>
                </ul>
                <Link href="/signup">
                  <Button className="w-full bg-black text-white hover:bg-gray-800">
                    Contact Sales
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* FAQ Section */}
      <section id="faq" className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl font-bold mb-6">Frequently Asked Questions</h2>
            <p className="text-lg text-gray-600">
              Find answers to common questions about our synthetic data generation platform.
            </p>
          </div>
          
          <div className="max-w-3xl mx-auto space-y-6">
            <Card className="shadow-md border-gray-200">
              <CardHeader>
                <CardTitle>What types of documents can I use?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Our platform supports virtually any text-based document including contracts, 
                  financial statements, standard operating procedures, policies, technical 
                  documentation, and more. We accept PDF, DOCX, TXT, and other common formats.
                </p>
              </CardContent>
            </Card>
            
            <Card className="shadow-md border-gray-200">
              <CardHeader>
                <CardTitle>How many synthetic variants can I generate?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  The number of synthetic variants depends on your subscription plan. Our Starter plan 
                  allows for 5,000 samples per month, Professional offers 15,000 samples, and Enterprise 
                  plans have unlimited generation capabilities.
                </p>
              </CardContent>
            </Card>
            
            <Card className="shadow-md border-gray-200">
              <CardHeader>
                <CardTitle>Is my data secure?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Yes, we take data security seriously. Your documents are processed in a secure 
                  environment, and we <strong>automatically delete all uploaded files once processing is complete</strong>. 
                  We never retain, analyze, or use your source documents beyond the specific data generation task. 
                  All data is encrypted in transit and at rest during the brief processing period.
                </p>
              </CardContent>
            </Card>
            
            <Card className="shadow-md border-gray-200">
              <CardHeader>
                <CardTitle>What AI models can I fine-tune with this data?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Our output format is compatible with all major AI platforms including OpenAI 
                  (GPT models), Anthropic (Claude), Meta (Llama), and other open-source models 
                  that accept JSONL training data formats.
                </p>
              </CardContent>
            </Card>
            
            <Card className="shadow-md border-gray-200">
              <CardHeader>
                <CardTitle>How is the pricing structured?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  We offer three simple pricing tiers: Starter ($20/month), Professional ($40/month), 
                  and Enterprise (custom pricing). Each tier includes different volumes of synthetic 
                  data generation, file upload limits, and support options. You can upgrade or downgrade 
                  at any time. For detailed information, check out our Pricing section.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-20 bg-black text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Ready to Transform Your Documents into Training Data?</h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-10">
            Create synthetic data that perfectly matches your organization's unique style.
            Sign up today and get started in minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-black hover:bg-gray-100 px-8 py-6 text-lg shadow-md">
                Create Account <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            {/* <Button size="lg" variant="outline" className="border-white text-white hover:bg-gray-900 px-8 py-6 text-lg">
              View Pricing
            </Button> */}
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Database className="h-6 w-6 text-white" />
                <span className="text-xl font-bold">Data Synthetix</span>
              </div>
              <p className="text-gray-400 mb-4">
                Transform your documents into high-quality synthetic training data with AI.
              </p>
              <div className="flex space-x-4">
                <a href="#" className="text-gray-400 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd"></path>
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"></path>
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd"></path>
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093-.39-1.988-.964-2.723.1-.245.427-1.27-.095-2.65 0 0-.787-.252-2.581.96-.752-.209-1.556-.315-2.36-.318-.805.003-1.609.109-2.36.318-1.797-1.212-2.586-.96-2.586-.96-.521 1.38-.193 2.405-.096 2.65-.571.735-.965 1.63-.965 2.723 0 3.83 2.33 4.695 4.544 4.942-.254.224-.49.634-.57 1.252-.514.232-1.815.626-2.617-.75 0 0-.477-.863-1.381-.927 0 0-.882-.011-.062.55 0 0 .59.276 1 1.31 0 0 .526 1.59 3.026 1.04.004.644.005 1.24.005 1.407 0 .267-.183.577-.687.482C3.865 20.194 1 16.438 1 12.013 1 6.48 5.478 2 11 2z" clipRule="evenodd"></path>
                  </svg>
                </a>
              </div>
            </div>
            
            <div>
              <h4 className="text-lg font-bold mb-4">Product</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white">Features</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Pricing</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Case Studies</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Documentation</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-lg font-bold mb-4">Company</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white">About</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Blog</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Careers</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-lg font-bold mb-4">Legal</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Terms of Service</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Security</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              &copy; {new Date().getFullYear()} Data Synthetix. All rights reserved.
            </p>
            <div className="mt-4 md:mt-0">
              <a href="#" className="text-gray-400 hover:text-white text-sm">
                Privacy Policy
              </a>
              <span className="mx-2 text-gray-600">|</span>
              <a href="#" className="text-gray-400 hover:text-white text-sm">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}