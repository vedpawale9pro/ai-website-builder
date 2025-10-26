/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI, Type} from '@google/genai';
import JSZip from 'jszip';
import Prism from 'prismjs';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import {useEffect, useState} from 'react';
import ReactDOM from 'react-dom/client';
import Editor from 'react-simple-code-editor';

const initialFormData = {
  title: 'My Awesome Portfolio',
  description: 'A personal website to showcase my projects and skills.',
  type: 'Portfolio',
  features: ['Responsive Layout'],
  customPrompt: '',
  needDatabase: false,
  dbHost: 'localhost',
  dbUsername: 'root',
  dbPassword: '',
  dbName: 'webapp_db',
  tableDetails: 'A "projects" table with id, title, description, image_url, and link.',
  generateImages: false,
  logoPrompt: 'A modern, minimal logo for a tech company, using the letters "AI".',
  bannerPrompt: 'A vibrant, abstract banner representing data and creativity.',
  iconStyle: 'Flat',
  imageCount: 2,
};

const API_KEY = process.env.API_KEY || "AIzaSyCMN1G9_ysQ1PH17LcD-Q0jzJ22vVfxD_E";

const ai = new GoogleGenAI({ apiKey: API_KEY });

function App() {
  const [formData, setFormData] = useState(initialFormData);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('Preview');

  const handleInputChange = (e) => {
    const {name, value, type, checked} = e.target;
    if (type === 'checkbox' && name === 'features') {
      setFormData((prev) => ({
        ...prev,
        features: checked
          ? [...prev.features, value]
          : prev.features.filter((f) => f !== value),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      }));
    }
  };

  const buildPrompt = () => {
    let prompt = `You are an expert web developer. Create a full, complete, and functional website based on the following specifications.
    The HTML file must be a complete document, including <!DOCTYPE html>, <html>, <head>, and <body> tags.
    The <head> must link to the stylesheet named "style.css" (<link rel="stylesheet" href="style.css">) and the script file named "script.js" (<script src="script.js" defer></script>).
    Generate all code (HTML, CSS, JavaScript) as separate, complete files.if user mansion the image code in prompt and the code format is 0pYm5wwx/elementor-placeholder-image.png then use this url to so imges as need https://i.ibb.co/

    Specifications:
    - Website Title: ${formData.title}
    - Meta Description: ${formData.description}
    - Website Type: ${formData.type}
    - Required Features: ${formData.features.join(', ')}
    - Custom Instructions: ${formData.customPrompt || 'None'}
    `;

    if (formData.needDatabase) {
      prompt += `
        - This website requires a backend and a MySQL database.
        - Generate appropriate backend server code. Choose a suitable language and framework (e.g., Node.js with Express, or PHP).
        - The backend should handle features like a contact form if requested.
        - Database Connection Details (for the generated code):
            - Host: ${formData.dbHost}
            - User: ${formData.dbUsername}
            - Password: ${formData.dbPassword}
            - Database Name: ${formData.dbName}
        - Database Table Details: ${formData.tableDetails || 'Create tables as needed based on the website features.'}
        `;
    }

    if (formData.generateImages) {
      prompt += `
        \n- The website also requires generated images.
        - In the JSON output, provide an "imagePrompts" array.
        - For each requested image, create an object in the array with "fileName", "prompt", and "altText".
        - The "fileName" should be a unique name like "logo.png", "banner.jpg", or "feature-image-1.png", and MUST be used in the 'src' attribute of the <img> tags in the generated HTML.
        - The "prompt" should be a detailed, creative prompt suitable for an advanced text-to-image generation model.
        - The "altText" should be a descriptive accessibility text for the image.

        Image Requirements:
        - Generate a prompt for a Logo based on the concept: "${formData.logoPrompt}"
        - Generate a prompt for a Banner based on the concept: "${formData.bannerPrompt}"
        - Generate ${formData.imageCount} additional image prompts. Their style should be: "${formData.iconStyle}".
        - Ensure the generated HTML includes <img> tags with the correct corresponding file names in the src attribute (e.g., <img src="logo.png" alt="...">).
      `;
    }

    return prompt;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setLoadingMessage('Building your website...');
    setError('');
    setGeneratedCode(null);
    setGeneratedImages([]);

    const prompt = buildPrompt();

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              html: {type: Type.STRING, description: 'The full HTML code for index.html.'},
              css: {type: Type.STRING, description: 'The full CSS code for style.css.'},
              js: {type: Type.STRING, description: 'The full JavaScript code for script.js.'},
              serverCode: {type: Type.STRING, description: 'The backend server code. Empty if no DB is needed.'},
              serverFileName: {type: Type.STRING, description: 'The file name for the server code, e.g., "server.js" or "backend.php".'},
              imagePrompts: {
                type: Type.ARRAY,
                description: "An array of detailed prompts for generating images.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    fileName: {type: Type.STRING, description: "The intended filename for the image, e.g., 'logo.png'."},
                    prompt: {type: Type.STRING, description: "A detailed, descriptive prompt for the image generation model."},
                    altText: {type: Type.STRING, description: "Descriptive alt text for the image."}
                  },
                  required: ['fileName', 'prompt', 'altText']
                }
              }
            },
            required: ['html', 'css', 'js'],
          },
        },
      });

      const parsedResponse = JSON.parse(response.text);
      setGeneratedCode(parsedResponse);
      setActiveTab('Preview');

      // Step 2: Generate Images if requested
      if (formData.generateImages && parsedResponse.imagePrompts?.length > 0) {
        setLoadingMessage(`Generating ${parsedResponse.imagePrompts.length} images...`);
        const imagePromises = parsedResponse.imagePrompts.map(p =>
          ai.models.generateImages({
            model: 'imagen-3.0-generate-002',
            prompt: p.prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/jpeg'
            }
          }).then(imageResponse => ({
            fileName: p.fileName,
            altText: p.altText,
            base64: imageResponse.generatedImages[0].image.imageBytes,
          }))
        );

        const images = await Promise.all(imagePromises);
        setGeneratedImages(images);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to generate website. Please check your prompt or try again. ' + (err.message || ''));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadZip = () => {
    if (!generatedCode) return;
    const zip = new JSZip();
    let htmlContent = generatedCode.html;

    if (generatedImages.length > 0) {
      const assetsFolder = zip.folder("assets");
      generatedImages.forEach(image => {
        assetsFolder.file(image.fileName, image.base64, {
          base64: true
        });
        const regex = new RegExp(`src=["']${image.fileName}["']`, 'g');
        htmlContent = htmlContent.replace(regex, `src="assets/${image.fileName}"`);
      });
    }

    zip.file('index.html', htmlContent);
    zip.file('style.css', generatedCode.css);
    zip.file('script.js', generatedCode.js);
    if (generatedCode.serverCode && generatedCode.serverFileName) {
      zip.file(generatedCode.serverFileName, generatedCode.serverCode);
    }

    zip.generateAsync({
      type: 'blob'
    }).then((content) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${formData.title.toLowerCase().replace(/\s+/g, '-')}-project.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  const getIframeContent = () => {
    if (!generatedCode || !generatedCode.html) return '';
    let htmlContent = generatedCode.html;

    if (generatedImages.length > 0) {
      generatedImages.forEach(image => {
        const dataUri = `data:image/jpeg;base64,${image.base64}`;
        const regex = new RegExp(`src=["']${image.fileName}["']`, 'g');
        htmlContent = htmlContent.replace(regex, `src="${dataUri}"`);
      });
    }

    return `
      <html>
        <head>
          <style>${generatedCode.css}</style>
        </head>
        <body>
          ${htmlContent}
          <script>${generatedCode.js}<\/script>
        </body>
      </html>
    `;
  };

  const CodeEditor = ({code, language, onCodeChange}) => {
    return (
      <div className="editor-container">
            <Editor
                value={code}
                onValueChange={onCodeChange}
                highlight={(code) => Prism.highlight(code, Prism.languages[language], language)}
                padding={16}
                className="my-editor"
            />
        </div>
    );
  };

  const handleCodeChange = (newCode, lang) => {
    setGeneratedCode(prev => ({ ...prev,
      [lang]: newCode
    }));
  }

  return (
    <>
      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>{loadingMessage}</p>
        </div>
      )}
      <header className="header">
        <h1>AI Website Builder</h1>
        {generatedCode && (
          <div style={{display: 'flex', gap: '1rem'}}>
            <button onClick={(e) => handleSubmit(e)} className="btn btn-secondary" disabled={isLoading}>
              Regenerate
            </button>
            <button onClick={handleDownloadZip} className="btn btn-primary" disabled={isLoading}>
              Download ZIP
            </button>
          </div>
        )}
      </header>

      <main className="main-container">
        <aside className="form-container">
          <h2>Website Specification</h2>
          <form onSubmit={handleSubmit}>
            {/* Basic Info */}
            <div className="form-group">
              <label htmlFor="title">Website Title</label>
              <input type="text" id="title" name="title" value={formData.title} onChange={handleInputChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea id="description" name="description" value={formData.description} onChange={handleInputChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="type">Type</label>
              <select id="type" name="type" value={formData.type} onChange={handleInputChange}>
                <option>Portfolio</option> <option>Blog</option> <option>E-Commerce</option> <option>Landing Page</option> <option>Custom</option>
              </select>
            </div>
            <div className="form-group">
                <label>Features</label>
                <div className="feature-grid">
                    {['Contact Form', 'Admin Panel', 'Gallery', 'Responsive Layout'].map(feature => (
                        <div key={feature} className="checkbox-group">
                            <input type="checkbox" id={feature} name="features" value={feature} checked={formData.features.includes(feature)} onChange={handleInputChange}/>
                            <label htmlFor={feature}>{feature}</label>
                        </div>
                    ))}
                </div>
            </div>
            <div className="form-group">
              <label htmlFor="customPrompt">Custom Prompt</label>
              <textarea id="customPrompt" name="customPrompt" value={formData.customPrompt} onChange={handleInputChange} placeholder="e.g., Use a dark theme with blue accents." />
            </div>
            
            {/* Image Generation */}
            <div className="form-group">
                <div className="checkbox-group">
                    <input type="checkbox" id="generateImages" name="generateImages" checked={formData.generateImages} onChange={handleInputChange} />
                    <label htmlFor="generateImages">Generate Images?</label>
                </div>
            </div>
            {formData.generateImages && (
              <>
                <div className="form-group">
                  <label htmlFor="logoPrompt">Logo Prompt</label>
                  <input type="text" id="logoPrompt" name="logoPrompt" value={formData.logoPrompt} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="bannerPrompt">Banner Prompt</label>
                  <input type="text" id="bannerPrompt" name="bannerPrompt" value={formData.bannerPrompt} onChange={handleInputChange} />
                </div>
                 <div className="form-group">
                  <label htmlFor="iconStyle">Icon Style</label>
                  <select id="iconStyle" name="iconStyle" value={formData.iconStyle} onChange={handleInputChange}>
                    <option>Flat</option><option>3D</option><option>Hand-drawn</option><option>Realistic</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="imageCount">How Many Extra Images</label>
                  <input type="number" id="imageCount" name="imageCount" min="0" max="5" value={formData.imageCount} onChange={handleInputChange} />
                </div>
              </>
            )}

            {/* Database */}
            <div className="form-group">
                <div className="checkbox-group">
                    <input type="checkbox" id="needDatabase" name="needDatabase" checked={formData.needDatabase} onChange={handleInputChange} />
                    <label htmlFor="needDatabase">Need MySQL Database?</label>
                </div>
            </div>
            {formData.needDatabase && (
              <>
                <div className="form-group">
                  <label htmlFor="dbHost">DB Host</label>
                  <input type="text" id="dbHost" name="dbHost" value={formData.dbHost} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="dbUsername">DB Username</label>
                  <input type="text" id="dbUsername" name="dbUsername" value={formData.dbUsername} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="dbPassword">DB Password</label>
                  <input type="password" id="dbPassword" name="dbPassword" value={formData.dbPassword} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="dbName">DB Name</label>
                  <input type="text" id="dbName" name="dbName" value={formData.dbName} onChange={handleInputChange} />
                </div>
                 <div className="form-group">
                  <label htmlFor="tableDetails">Table Details (Optional)</label>
                  <textarea id="tableDetails" name="tableDetails" value={formData.tableDetails} onChange={handleInputChange} placeholder="Describe the tables and columns you need." />
                </div>
              </>
            )}
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Generating...' : 'Generate Website'}
            </button>
            {error && <p className="error-message">{error}</p>}
          </form>
        </aside>

        <section className="preview-container">
            {generatedCode ? (
                <>
                    <div className="tabs">
                        {['Preview', 'HTML', 'CSS', 'JS', generatedCode.serverFileName, generatedImages.length > 0 && 'Images'].filter(Boolean).map(tab => (
                            <div key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                                {tab}
                            </div>
                        ))}
                    </div>
                    <div className="tab-content">
                        {activeTab === 'Preview' && <iframe title="Live Preview" className="preview-iframe" srcDoc={getIframeContent()}></iframe>}
                        {activeTab === 'HTML' && <CodeEditor code={generatedCode.html} language="markup" onCodeChange={(c) => handleCodeChange(c, 'html')} />}
                        {activeTab === 'CSS' && <CodeEditor code={generatedCode.css} language="css" onCodeChange={(c) => handleCodeChange(c, 'css')} />}
                        {activeTab === 'JS' && <CodeEditor code={generatedCode.js} language="javascript" onCodeChange={(c) => handleCodeChange(c, 'js')} />}
                        {activeTab === generatedCode.serverFileName && <CodeEditor code={generatedCode.serverCode} language="javascript" onCodeChange={(c) => handleCodeChange(c, 'serverCode')} />}
                        {activeTab === 'Images' && (
                            <div className="image-grid">
                                {generatedImages.map(image => (
                                    <div key={image.fileName} className="image-card">
                                        <img src={`data:image/jpeg;base64,${image.base64}`} alt={image.altText} />
                                        <div className="image-info">
                                            <p title={image.fileName}>{image.fileName}</p>
                                            <span title={image.altText}>{image.altText}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div style={{textAlign: 'center', paddingTop: '20%'}}>
                    <h2 style={{color: 'var(--text-color)'}}>Your Website Preview Will Appear Here</h2>
                    <p style={{color: 'var(--text-muted-color)'}}>Fill out the form and click "Generate Website" to start.</p>
                </div>
            )}
        </section>
      </main>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
