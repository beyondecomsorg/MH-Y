import os
import json
import re

workspace_dir = r"c:\Users\abala\OneDrive\Desktop\MH-Y-19-06-2026\MH-Y"
index_json_path = os.path.join(workspace_dir, "templates", "index.json")
sections_dir = os.path.join(workspace_dir, "sections")

def add_padding_to_section(section_name):
    filename = f"{section_name}.liquid"
    filepath = os.path.join(sections_dir, filename)
    if not os.path.exists(filepath):
        print(f"Skipping {section_name}: File not found")
        return

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Define the new schema settings to inject
    padding_schema_settings = """
    {
      "type": "range",
      "id": "desktop_padding_top",
      "min": 0,
      "max": 100,
      "step": 1,
      "unit": "px",
      "label": "Section Top Padding (Desktop)",
      "default": 30
    },
    {
      "type": "range",
      "id": "desktop_padding_bottom",
      "min": 0,
      "max": 100,
      "step": 1,
      "unit": "px",
      "label": "Section Bottom Padding (Desktop)",
      "default": 30
    },
    {
      "type": "range",
      "id": "mobile_padding_top",
      "min": 0,
      "max": 100,
      "step": 1,
      "unit": "px",
      "label": "Section Top Padding (Mobile)",
      "default": 15
    },
    {
      "type": "range",
      "id": "mobile_padding_bottom",
      "min": 0,
      "max": 100,
      "step": 1,
      "unit": "px",
      "label": "Section Bottom Padding (Mobile)",
      "default": 15
    }"""

    # We need to inject this inside {% schema %} -> "settings": [...]
    # Let's locate the main "settings" block, not block level settings.
    # To do this safely, we find the "settings" list that is outside block structures.
    # Or, we can parse the schema JSON, inject the settings, and then dump it back or edit it.
    # Since we want to preserve comments, let's find the main `"settings": [` block.
    # We find where '"settings": [' occurs in the schema block.
    # A standard Shopify schema has "blocks": [...] first or "settings": [...] first.
    # If blocks is defined, we must ignore settings blocks inside blocks.
    # Let's locate the schema block content:
    schema_match = re.search(r'\{%\s*schema\s*%\}(.*?)\{%\s*endschema\s*\%}', content, re.DOTALL)
    if not schema_match:
        print(f"Skipping {section_name}: No schema block found")
        return

    schema_raw = schema_match.group(0)
    
    # We can split the schema_raw into main settings vs blocks settings.
    # Let's target the top-level `"settings"\s*:\s*\[` definition. 
    # Usually, block-level settings are nested inside `"blocks": [ { "settings": [...] } ]`.
    # Let's match `"settings"\s*:\s*\[` that is NOT preceded by `"type":` or `"name":` within a block context.
    # Or simply do a regex replacement that matches `"settings": [` at the outermost level.
    # Since outer-level keys are formatted without deep indentation:
    outer_settings_match = re.search(r'^\s*"settings"\s*:\s*\[', schema_raw, re.MULTILINE)
    if not outer_settings_match:
        # Try without strict line start in case it's formatted differently
        outer_settings_match = re.search(r'"settings"\s*:\s*\[', schema_raw)
        if not outer_settings_match:
            print(f"Skipping {section_name}: No outer settings list found in schema")
            return

    # Let's check if the section already has this setting
    if "desktop_padding_top" in content:
        print(f"Skipping {section_name}: Already contains padding settings")
        return

    # We replace the outer settings match with our injected settings
    start_idx = content.find(schema_raw)
    match_offset = outer_settings_match.end()
    absolute_insert_pos = start_idx + content[start_idx:].find(outer_settings_match.group(0)) + len(outer_settings_match.group(0))

    content = content[:absolute_insert_pos] + padding_schema_settings + "," + content[absolute_insert_pos:]

    # Now let's inject custom stylesheet style tags dynamically
    dynamic_style_tag = """
{% style %}
  #shopify-section-{{ section.id }} {
    padding-top: {{ section.settings.desktop_padding_top }}px !important;
    padding-bottom: {{ section.settings.desktop_padding_bottom }}px !important;
  }
  @media screen and (max-width: 740px) {
    #shopify-section-{{ section.id }} {
      padding-top: {{ section.settings.mobile_padding_top }}px !important;
      padding-bottom: {{ section.settings.mobile_padding_bottom }}px !important;
    }
  }
{% endstyle %}
"""
    # Insert style tag at the very top of the file
    content = dynamic_style_tag + "\n" + content

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Successfully updated {section_name}")

def main():
    with open(index_json_path, 'r', encoding='utf-8') as f:
        raw_text = f.read()
    
    # Strip comments from index.json before parsing
    clean_text = re.sub(r'/\*.*?\*/', '', raw_text, flags=re.DOTALL)
    index_data = json.loads(clean_text)

    sections_config = index_data.get("sections", {})
    unique_section_types = set()
    for section_id, section_conf in sections_config.items():
        sect_type = section_conf.get("type")
        if sect_type:
            unique_section_types.add(sect_type)

    print("Found homepage sections:", unique_section_types)
    for sect_type in unique_section_types:
        add_padding_to_section(sect_type)

if __name__ == "__main__":
    main()
