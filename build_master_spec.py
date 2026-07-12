import os
import re
import glob

def extract_sections(filename, allowed_keywords):
    content = ""
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split by level 2 headers
    sections = re.split(r'\n## ', '\n' + content)
    
    extracted = []
    for sec in sections:
        if not sec.strip():
            continue
        header = sec.split('\n')[0].lower()
        if any(keyword in header for keyword in allowed_keywords):
            extracted.append("## " + sec.strip())
            
    return '\n\n'.join(extracted)

def main():
    reviews_dir = 'reviews'
    files = glob.glob(os.path.join(reviews_dir, 'review-*.md'))
    
    # Keywords for the sections we care about
    allowed_keywords = [
        '0. global architecture',
        '1. auth & onboarding',
        '2. stockist module',
        '3. pharmacy module',
        'admin module',
        'payments, credit',
        'money logic',
        'ai & edge',
        'smart order',
        'data model',
        'expansion'
    ]
    
    master_content = [
        "# MASTER APPLICATION SPECIFICATION (Admin / Stockist / Pharmacy)",
        "> This document is a merged specification focusing ONLY on Admin, Stockist, and Pharmacy roles.",
        "> It includes the base features and all deep-trace expansions from the 8 repository reviews.",
        "---"
    ]
    
    for f in sorted(files):
        repo_name = os.path.basename(f).replace('review-', '').replace('.md', '')
        master_content.append(f"\n\n# Source: {repo_name}\n")
        extracted = extract_sections(f, allowed_keywords)
        master_content.append(extracted)
        
    with open('MASTER_APPLICATION_SPECIFICATION.md', 'w', encoding='utf-8') as out_f:
        out_f.write('\n'.join(master_content))
    
    print("Successfully built MASTER_APPLICATION_SPECIFICATION.md")

if __name__ == '__main__':
    main()
