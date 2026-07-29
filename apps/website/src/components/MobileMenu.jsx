import { useEffect } from "react";
import { NavLink } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

export function MobileMenu({ isOpen, onClose, links }) {
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("menu-open");
    } else {
      document.body.classList.remove("menu-open");
    }
    return () => document.body.classList.remove("menu-open");
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 bg-navy/95 backdrop-blur-xl flex flex-col"
        >
          <div className="flex items-center justify-end px-6 pt-5">
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white transition-colors"
              aria-label="Close menu"
            >
              <X size={28} />
            </button>
          </div>

          <nav className="flex flex-col items-center justify-center flex-1 gap-2 px-6">
            {links.map((link, i) => (
              <motion.div
                key={link.to}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.06, duration: 0.4 }}
              >
                <NavLink
                  to={link.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `block text-2xl font-semibold py-3 px-4 transition-colors ${
                      isActive ? "text-brand" : "text-white/90 hover:text-white"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </motion.div>
            ))}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="mt-8"
            >
              <a
                href="https://www.torcapp.com"
                onClick={onClose}
                className="inline-block bg-brand text-white font-semibold px-8 py-3 rounded-full text-lg hover:bg-brand-bright transition-colors"
              >
                Download App
              </a>
            </motion.div>
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
