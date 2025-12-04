# Pandemic FHE: An Encrypted Board Game Experience 🌍🎲

Pandemic FHE is an innovative take on the beloved cooperative board game "Pandemic," transformed into a blockchain experience with the power of **Zama's Fully Homomorphic Encryption technology**. In this game, the spread of diseases across various cities is encrypted, ensuring that players can only see cities where outbreaks have occurred. This lack of complete information heightens the challenge of combating the disease, demanding teamwork and strategy from all players involved.

## The Challenge We Face 🚨

In today's interconnected world, a disease outbreak can have catastrophic implications. Traditional board games allow players to strategize and cooperate, but they often lack the realism and unpredictability of actual pandemics. Players need to engage with the same level of uncertainty that healthcare professionals face in real-world scenarios. This project addresses the gap by creating an engaging and authentic gaming experience where the strategies must adapt to hidden challenges and unknown variables.

## A Revolutionary FHE Solution 🔐

By leveraging **Zama's Fully Homomorphic Encryption**, Pandemic FHE ensures that all data regarding disease spread remains confidential. Players can't see the entire picture; they can only act on the information available to them in real-time. This dynamic implementation uses Zama's open-source libraries like **Concrete** to manage the encrypted communication and game logic—turning strategy into an ever-evolving puzzle where teamwork is essential for survival.

### How it Works

1. **Disease Spread**: The path of disease spread is encrypted using FHE, making it impossible for players to predict future outbreaks without collaborating and sharing insights.
2. **Limited Visibility**: Players can only see which cities have experienced outbreaks, forcing them to rely on communication and strategic planning to determine their next moves.
3. **Collaborative Decision-Making**: Each player must work together to address the unknown factors of the outbreak, making every game session a unique challenge.

## Key Features 🌟

- **FHE-Encrypted Disease Spread**: The entire mechanism of disease outbreaks is secured, enhancing the thrill of the game with unpredictable events.
- **Enhanced Uncertainty**: Players face a more mentally stimulating environment where they must make decisions based on incomplete information.
- **Realistic Virus Diffusion Simulation**: The game effectively mimics the unpredictability of real-world virus outbreaks, testing players’ collaborative strategies and planning abilities.
- **Multiplayer Co-op Gameplay**: Designed for collaboration, players must share information and strategies to prevail against the pandemic.

## Technology Stack 🛠️

- **Zama FHE SDK**: The backbone of the game's encryption and data handling.
- **Node.js**: For running the game's server-side logic.
- **Hardhat**: A development environment for Ethereum-based smart contracts.
- **TypeScript**: To ensure strong typing and improved development workflows.

## Directory Structure 📁

Here's the structure of the project directory:

```
Pandemic_FHE/
│
├── contracts/
│   ├── Pandemic_FHE.sol
│
├── src/
│   ├── index.ts
│   ├── gameLogic.ts
│   └── encryption.ts
│
├── public/
│   ├── index.html
│   └── styles.css
│
├── tests/
│   ├── Pandemic_FHE.test.js
│
├── package.json
└── README.md
```

## Installation Guide ⚙️

To set up Pandemic FHE on your local machine, ensure you have the following dependencies installed: **Node.js** and **Hardhat**.

1. **Download** the project files (strictly do not use `git clone`).
2. Open a terminal and navigate to the project directory.
3. Run the following command to install the necessary dependencies:

   ```bash
   npm install
   ```

This command will also fetch the Zama FHE libraries required for the encrypted game logic.

## Build & Run Guide 🚀

Once the dependencies are installed, you can compile and run the project using the following commands:

1. **Compile the Smart Contracts**:

   ```bash
   npx hardhat compile
   ```

2. **Run the Game**:

   ```bash
   npx hardhat run scripts/deploy.ts
   ```

3. **Execute Tests**:

   To ensure everything is functioning as expected, run:

   ```bash
   npx hardhat test
   ```

### Example Code

Here’s a brief example of how to implement disease spread logic using FHE:

```typescript
import * as Concrete from 'zama-fhe-sdk';

async function simulateOutbreak(city: string, outbreakLevel: number) {
    const encryptedData = Concrete.encrypt({
        city: city,
        outbreakLevel: outbreakLevel
    });
    
    // Simulate spread
    const spreadResult = await Concrete.simulateSpread(encryptedData);

    return spreadResult;
}
```

This code snippet demonstrates how to encrypt outbreak data and simulate its spread, showcasing the capabilities of Zama's technology in handling sensitive information seamlessly.

## Acknowledgements 🙏

This project is made possible thanks to the pioneering work of the Zama team. Their commitment to advancing open-source tools and Fully Homomorphic Encryption has empowered us to create this engaging and confidential blockchain application. Together, we can face the challenges of modern pandemics—both in real life and in the game!

---

Join us in this thrilling challenge to outsmart the pandemic with unmatched strategy and cooperation! 🌟
