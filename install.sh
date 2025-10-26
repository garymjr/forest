#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect OS and architecture
OS=$(uname -s)
ARCH=$(uname -m)

# Map architecture to binary naming
case "$ARCH" in
  x86_64|amd64)
    ARCH_MAPPED="x64"
    ;;
  arm64|aarch64)
    ARCH_MAPPED="arm64"
    ;;
  armv7l|armv7)
    echo -e "${RED}Error: ARMv7 (32-bit ARM) is not supported.${NC}"
    echo -e "${YELLOW}Please use 64-bit ARM (ARM64/aarch64) or x64.${NC}"
    exit 1
    ;;
  i386|i686)
    echo -e "${RED}Error: 32-bit x86 (i386/i686) is not supported.${NC}"
    echo -e "${YELLOW}Please use 64-bit x86 (x64) or ARM64.${NC}"
    exit 1
    ;;
  *)
    echo -e "${RED}Error: Unsupported or unknown architecture: $ARCH${NC}"
    echo -e "${YELLOW}Supported architectures: x64, arm64${NC}"
    exit 1
    ;;
esac

# Determine binary name based on OS
case "$OS" in
  Linux)
    BINARY_NAME="forest-linux-${ARCH_MAPPED}"
    ;;
  Darwin)
    if [ "$ARCH_MAPPED" != "arm64" ]; then
      echo -e "${RED}Error: macOS x64 is not supported. Please use macOS ARM64 (Apple Silicon).${NC}"
      exit 1
    fi
    BINARY_NAME="forest-macos-arm64"
    ;;
  *)
    echo -e "${RED}Error: Unsupported operating system: $OS${NC}"
    exit 1
    ;;
esac

GITHUB_REPO="garymjr/forest"
GITHUB_API_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
INSTALL_DIR="$HOME/.local/bin"
INSTALL_PATH="$INSTALL_DIR/forest"

echo -e "${YELLOW}Installing forest...${NC}"
echo "Platform: $OS $ARCH"
echo "Binary: $BINARY_NAME"

# Fetch latest release info
echo -e "${YELLOW}Fetching latest release...${NC}"
LATEST_RELEASE=$(curl -fsSL "$GITHUB_API_URL" 2>/dev/null || echo "")

if [ -z "$LATEST_RELEASE" ]; then
  echo -e "${RED}Error: Failed to fetch latest release from GitHub${NC}"
  exit 1
fi

# Extract download URL safely using jq if available, fallback to grep
if command -v jq &> /dev/null; then
  DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | jq -r ".assets[] | select(.name | contains(\"$BINARY_NAME\")) | .browser_download_url" | head -1)
else
  # Safer fallback: escape special regex characters comprehensively
  ESCAPED_BINARY_NAME=$(printf '%s\n' "$BINARY_NAME" | sed 's/[[\.*^$\/]/\\&/g')
  DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | sed -n "s/.*\"browser_download_url\": \"\([^\"]*$ESCAPED_BINARY_NAME[^\"]*\)\".*/\1/p" | head -1)
fi

if [ -z "$DOWNLOAD_URL" ]; then
  echo -e "${RED}Error: Could not find binary for your platform ($BINARY_NAME) in the latest release${NC}"
  echo -e "${YELLOW}Available platforms: Linux x64, macOS ARM64${NC}"
  exit 1
fi

# Create temporary directory with error handling
TEMP_DIR=$(mktemp -d 2>/dev/null) || {
  echo -e "${RED}Error: Failed to create temporary directory${NC}"
  exit 1
}
trap "rm -rf $TEMP_DIR" EXIT

TEMP_BINARY="$TEMP_DIR/forest"

# Download binary
echo -e "${YELLOW}Downloading from: $DOWNLOAD_URL${NC}"
if ! curl -fsSL -o "$TEMP_BINARY" "$DOWNLOAD_URL"; then
  echo -e "${RED}Error: Failed to download binary${NC}"
  exit 1
fi

# Validate downloaded file
if [ ! -f "$TEMP_BINARY" ]; then
  echo -e "${RED}Error: Binary file was not created${NC}"
  exit 1
fi

BINARY_SIZE=$(stat -f%z "$TEMP_BINARY" 2>/dev/null || stat -c%s "$TEMP_BINARY" 2>/dev/null || echo 0)
MIN_SIZE=1000000  # ~1MB minimum
MAX_SIZE=100000000  # ~100MB maximum

if [ "$BINARY_SIZE" -lt "$MIN_SIZE" ] || [ "$BINARY_SIZE" -gt "$MAX_SIZE" ]; then
  echo -e "${RED}Error: Invalid binary size: $BINARY_SIZE bytes (expected 1MB-100MB)${NC}"
  exit 1
fi

# Make executable
chmod +x "$TEMP_BINARY"

# Create install directory
mkdir -p "$INSTALL_DIR"

# Install binary
echo -e "${YELLOW}Installing to $INSTALL_PATH${NC}"
cp "$TEMP_BINARY" "$INSTALL_PATH"

# Check if ~/.local/bin is in PATH
if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
  echo -e "${YELLOW}Note: $HOME/.local/bin is not in your PATH${NC}"
  echo -e "${YELLOW}Add it to your shell profile with: export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
fi

# Verify installation
echo -e "${YELLOW}Verifying installation...${NC}"
if [ ! -x "$INSTALL_PATH" ]; then
  echo -e "${RED}Error: Binary is not executable at $INSTALL_PATH${NC}"
  exit 1
fi

if "$INSTALL_PATH" --version &> /dev/null; then
  VERSION=$("$INSTALL_PATH" --version 2>/dev/null || echo "unknown")
  echo -e "${GREEN}Successfully installed forest!${NC}"
  echo "Location: $INSTALL_PATH"
  echo "Version: $VERSION"
  echo ""
  echo -e "${YELLOW}Get started:${NC}"
  echo "  forest help    - Show help information"
  echo "  forest list    - List your git worktrees"
else
  echo -e "${RED}Error: Installation verification failed${NC}"
  echo -e "${YELLOW}forest binary exists but is not working properly${NC}"
  echo -e "${YELLOW}Try running: $INSTALL_PATH --help${NC}"
  exit 1
fi
