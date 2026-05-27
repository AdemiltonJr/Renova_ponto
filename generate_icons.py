import os
import argparse
from PIL import Image, ImageOps

def generate_icons(target_ratio, output_dir="public"):
    source_logo = "RENOVA LOGO.png"
    if not os.path.exists(source_logo):
        print(f"Error: {source_logo} not found!")
        return

    with Image.open(source_logo) as img:
        # Convert to RGBA just in case
        img = img.convert("RGBA")
        
        # Get bounding box of the logo content
        bbox = img.getbbox()
        if not bbox:
            print("Error: Could not find bounding box of logo content (image is empty).")
            return
        
        # Crop to the actual logo bounds
        cropped = img.crop(bbox)
        crop_w, crop_h = cropped.size
        print(f"Original cropped size: {crop_w}x{crop_h}")
        
        # We will generate both 192x192 and 512x512 icons
        sizes = [192, 512]
        
        for size in sizes:
            # Create a solid white background canvas
            canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
            
            # Determine maximum width/height of the logo based on the target_ratio
            max_dim = int(size * target_ratio)
            
            # Scale factor to preserve aspect ratio
            scale = min(max_dim / crop_w, max_dim / crop_h)
            new_w = int(crop_w * scale)
            new_h = int(crop_h * scale)
            
            # Resize the cropped logo
            resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
            
            # Calculate position to center the logo
            offset_x = (size - new_w) // 2
            offset_y = (size - new_h) // 2
            
            # Paste the logo (using its alpha channel as a mask to preserve transparency over the white background)
            canvas.alpha_composite(resized, (offset_x, offset_y))
            
            # Convert to RGB (or keep as RGBA but with solid background)
            final_icon = canvas.convert("RGB")
            
            # Save the file
            out_path = os.path.join(output_dir, f"icon-{size}.png")
            final_icon.save(out_path, "PNG")
            print(f"Generated {out_path} ({size}x{size}) with logo size {new_w}x{new_h} (occupying {max(new_w, new_h)/size*100:.1f}%)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate PWA icons with custom margin/ratio.")
    parser.add_argument("--ratio", type=float, default=0.45, help="Ratio of the logo relative to the canvas size (default: 0.45)")
    args = parser.parse_args()
    
    generate_icons(args.ratio)
